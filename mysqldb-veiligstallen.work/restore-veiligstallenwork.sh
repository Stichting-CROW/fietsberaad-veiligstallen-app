#!/bin/bash

# Determine the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# exit if the .env file is not found
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo ".env file not found. Exiting."
    exit 1
fi

source $SCRIPT_DIR/.env

# exit here if any of the variables are not set
if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DBUSER_RW" ] || [ -z "$DBUSER_RW_PASSWORD" ]; then
    echo "One or more environment variables are not set. Check your .env file. Exiting."
    exit 1
fi

check_database_users_exist() {
    trap 'unset MYSQL_PWD' EXIT

    # check if DBUSER_RW exist by attempting to connect to the database using the RW user credentials
    export MYSQL_PWD="$DBUSER_RW_PASSWORD"
    userrw_exists=$(mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" -p"$DBUSER_RW_PASSWORD" "$DB_NAME" -e "SELECT 1" 2>/dev/null)

    # check if DBUSER_RO exist by attempting to connect to the database using the RO user credentials
    export MYSQL_PWD="$DBUSER_RO_PASSWORD"
    userro_exists=$(mysql -h "$DB_HOST" -u "$DBUSER_RO" -P "$DB_PORT" -e "SELECT 1" 2>/dev/null)

    if [ -z "$userrw_exists" ] || [ -z "$userro_exists" ]; then 
        echo "One or more database users do not exist in the $DB_NAME database or have incorrect credentials."
        echo "Please use these bash commands as an administrative user on the veiligstallen.work vps to check / create them."
        echo 
        echo "mysql -e \"CREATE DATABASE IF NOT EXISTS $DB_NAME;\""
        echo "mysql -e \"CREATE USER IF NOT EXISTS '$DBUSER_RW'@'$DB_HOST' IDENTIFIED BY '$DBUSER_RW_PASSWORD';\""
        echo "mysql -e \"GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DBUSER_RW'@'$DB_HOST';\""
        echo "mysql -e \"CREATE USER IF NOT EXISTS '$DBUSER_RO'@'$DB_HOST' IDENTIFIED BY '$DBUSER_RO_PASSWORD';\""
        echo "mysql -e \"GRANT SELECT ON $DB_NAME.* TO '$DBUSER_RO'@'$DB_HOST';\""
        echo 
        echo "you can check if the users exist with the following command:"
        echo "mysql -e \"SELECT host, user FROM mysql.user WHERE user IN ('$DBUSER_RW', '$DBUSER_RO');\""
        echo "mysql -e \"SHOW GRANTS FOR '$DBUSER_RW'@'$DB_HOST';\""
        echo "mysql -e \"SHOW GRANTS FOR '$DBUSER_RO'@'$DB_HOST';\""
        echo 
        echo "you can alter the passwords with the following commands:"
        echo "mysql -e \"ALTER USER '$DBUSER_RW'@'$DB_HOST' IDENTIFIED BY '$DBUSER_RW_PASSWORD';\""
        echo "mysql -e \"ALTER USER '$DBUSER_RO'@'$DB_HOST' IDENTIFIED BY '$DBUSER_RO_PASSWORD';\""
        echo 
        echo "flush privileges to make sure the changes are applied;"
        echo "mysql -e \"FLUSH PRIVILEGES;\""

        return 1
    fi

    return 0
}

restore_structure() {
    local dump_file="./mysqldb-productiondata/export-db-structure.sql"

    if [ ! -f "$dump_file" ]; then
        echo "Structure dump file not found: $dump_file"
        return
    fi

    local start_time=$(date +"%H:%M:%S")
    echo "Restoring database structure from $dump_file at $start_time"
        if [ "$DB_NAME" != "veiligstallen" ]; then
            # replace the database name in the dump file
            mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" --quick "$DB_NAME" < <(sed 's/veiligstallen/veiligstallenprisma/g' "$dump_file")
        else
            mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" --quick "$DB_NAME" < "$dump_file"
        fi

    # execute these mysql commands after importing
    # echo "converting fk column to bigint for bikeparklog"
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE bikeparklog MODIFY PlaceID BIGINT;"

    # echo "converting 2 fk columns to bigint for financialtransactions"
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE financialtransactions MODIFY placeID BIGINT;"

    # # refers to fietsenstalling_sectie.externalID
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE financialtransactions MODIFY sectionID INT NOT NULL;"

    # echo "converting fk column to bigint for fmsservicelog" 
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE fmsservicelog MODIFY plekID BIGINT;"

    # echo "converting fk column to bigint for fietsenstalling_plek"
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE fietsenstalling_plek MODIFY sectie_id INT NOT NULL;"

    # echo "converting 2 fk columns to bigint for abonnementen"
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE abonnementen MODIFY plekID BIGINT;"

    # # refers to fietsenstalling_sectie.externaalid
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE abonnementen MODIFY sectionID INT NOT NULL;"

    # echo "converting fk column to bigint for abonnementen"
    # mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "ALTER TABLE transacties MODIFY PlaceID BIGINT;"

    # for now, drop unused tables
    drop_unused_tables
}

drop_unused_tables() {
    # for now, drop unused ds_ tables
    local tablelist="ds_accessories ds_canonical_vehicle_categories ds_canonical_vehicle_json ds_canonical_vehicles ds_capacity_measurements ds_capacity_per_parking_spacetypes ds_observations ds_occupation_measurements ds_parking_locations ds_parking_spacetype_vehicle ds_parking_spacetypes ds_sections ds_survey_areas ds_surveyareas_parkinglocations ds_surveyareas_surveys ds_surveys ds_vehicle_propulsion ds_vehicle_state ds_vehicle_type_counts ds_vehicles"

    for table in $tablelist; do
        echo "Dropping unused table $table"
        # disable foreign key checks to prevent errors based on links between the ds_ tables
        mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" "$DB_NAME" -e "SET FOREIGN_KEY_CHECKS = 0; DROP TABLE $table; SET FOREIGN_KEY_CHECKS = 1;"
    done
}

restore_tables_individual() {
    local tablelist="$1"

    for table in $tablelist; do
        local dump_file="./mysqldb-productiondata/export-db-${table}.sql"
        
        if [ ! -f "$dump_file" ]; then
            echo "Dump file for table $table not found, skipping: $dump_file"
            continue
        fi

        local start_time=$(date +"%H:%M:%S")
        echo "Restoring table $table from $dump_file at $start_time"
        # Disable unique checks for faster import (equivalent to --disable-keys)
        # Note: SET UNIQUE_CHECKS is session-level, so we must combine it with the import in a single session
        if [ "$DB_NAME" != "veiligstallen" ]; then
            # replace the database name in the dump file
            mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" --quick "$DB_NAME" < <(
                echo "SET UNIQUE_CHECKS = 0;"
                sed 's/veiligstallen/veiligstallenprisma/g' "$dump_file"
                echo "SET UNIQUE_CHECKS = 1;"
            )
        else
            mysql -h "$DB_HOST" -u "$DBUSER_RW" -P "$DB_PORT" --quick "$DB_NAME" < <(
                echo "SET UNIQUE_CHECKS = 0;"
                cat "$dump_file"
                echo "SET UNIQUE_CHECKS = 1;"
            )
        fi
        
        local end_time=$(date +"%H:%M:%S")
        echo "Restoring table $table done at $end_time"
    done
}

check_database_users_exist
if [ $? -ne 0 ]; then
    exit 1
fi

# Ensure MYSQL_PWD is unset if the script is aborted
trap 'unset MYSQL_PWD' EXIT

export MYSQL_PWD="$DBUSER_RW_PASSWORD"

# Prompt the user to confirm database deletion
read -p "Are you sure that you want to delete and restore the $DB_NAME database? Type 'yes' to proceed: " confirm_structureimport
# Prompt the user to confirm database import
read -p "Do you want to restore the production data to the $DB_NAME database? This will take a long time. Type 'yes' to proceed: " confirm_dataimport

if [ "$confirm_structureimport" != "yes" ]; then
    echo "Operation cancelled"
    exit 0
fi

echo "Proceeding with database delete and restore"

# Restore the database structure
restore_structure

if [ "$confirm_dataimport" != "yes" ]; then
        echo "Data restore skipped"
    exit 0
fi

echo "Proceeding with database data import"

# Lists of tables to restore

# partial restore
TABLES_DONE=""
TABLES_CONFIG="abonnementen abonnementsvorm_fietsenstalling abonnementsvorm_fietstype abonnementsvormen account_transacties accounts accounts_pasids articles articles_templates barcoderegister  bikeparklog bulkreservering bulkreserveringuitzondering contact_contact contact_fietsenstalling contact_report_settings contacts contacts_faq contacts_fietsberaad documenttemplates externe_apis externe_apis_locaties faq fietsenstalling_plek fietsenstalling_plek_bezetting fietsenstalling_sectie fietsenstalling_sectie_kostenperioden fietsenstallingen fietsenstallingen_services fietsenstallingen_winkansen fietsenstallingtypen fietstypen financialtransactions fmsservice_permit fmsservicelog gemeenteaccounts historischesaldos instellingen klanttypen log lopers loterij_log mailings_lists mailings_members mailings_messages mailings_standaardteksten modules modules_contacts modules_contacts_copy1 plaats_fietstype presentations presentations_ticker prijswinnaars prijswinnaars_backup prijzen prijzenpot producten rapportageinfo schema_version sectie_fietstype sectie_fietstype_tmp security_roles security_users security_users_sites services sleutelhangerreeksen tariefcodes tariefregels tariefregels_copy1 tariefregels_copy2 tariefregels_copy3 tariefregels_copy4 tariefregels_copy5 tariefregels_tmp texts tmp_audit_grabbelton_na tmp_audit_grabbelton_voor  transacties_gemeente_totaal transacties_view trekkingen uitzonderingenopeningstijden unieke_bezoekers users_beheerder_log v_ds_surveyareas_parkinglocations vw_fmsservice_errors vw_locations vw_lopende_transacties vw_pasids vw_stallingstegoeden vw_stallingstegoedenexploitant wachtlijst wachtlijst_fietstype wachtlijst_item wachtrij_betalingen wachtrij_pasids wachtrij_sync winkansen winkansen_reminderteksten winkansen_zelf_inzet emails transacties_archief_tmp bezettingsdata_tmp user_contact_role user_status"

# All tables from backup that are NOT in TABLES_CONFIG (data tables)
TABLES_DATA="transacties transacties_archief bezettingsdata bezettingsdata_day_hour_cache stallingsduur_cache transacties_archief_day_cache wachtrij_transacties"

#for now not restored, 4GB and not used
TABLES_DATA_SKIP="webservice_log"

restore_tables_individual "$TABLES_CONFIG"
restore_tables_individual "$TABLES_DATA"

echo "Restore complete"