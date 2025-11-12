#!/bin/bash

# Prompt for the database password
read -sp "Enter the database password: " DB_PASSWORD
echo

# Export the password as an environment variable
export MYSQL_PWD="$DB_PASSWORD"

# Ensure MYSQL_PWD is unset if the script is aborted
trap 'unset MYSQL_PWD' EXIT

# DB_HOST=vst-eu-prd-msql02.mysql.database.azure.com
DB_HOST=10.132.29.69
DB_USER=veiligstallen_web
DB_NAME=veiligstallen

backup_structure() {
    local dump_file="./mysqldb-productiondata/export-db-structure.sql"
    local options="--no-tablespaces --routines --triggers --events --skip-comments --no-data"

    if [ -f "$dump_file" ]; then
        echo "Structure backup already exists, skipping: $dump_file"
        return
    fi

        local start_time=$(date +"%H:%M:%S")
        echo "Backing up database structure to $dump_file at $start_time"
    echo "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;" > "$dump_file"
    echo "USE \`$DB_NAME\`;" >> "$dump_file"
    echo "SET FOREIGN_KEY_CHECKS = 0;" >> "$dump_file"
    mysqldump -h "$DB_HOST" -u "$DB_USER" $options "$DB_NAME" >> "$dump_file"
    echo "SET FOREIGN_KEY_CHECKS = 1;" >> "$dump_file"
}

backup_tables_individual() {
    local tablelist="$1"
    local options="$2"

    for table in $tablelist; do
        local dump_file="./mysqldb-productiondata/export-db-${table}.sql"
        
        if [ -f "$dump_file" ]; then
            echo "Backup for table $table already exists, skipping: $dump_file"
            continue
        fi

        local start_time=$(date +"%H:%M:%S")
        echo "Backing up table $table to $dump_file at $start_time"
        
        echo "USE \`$DB_NAME\`;" >> "$dump_file"
        echo "SET FOREIGN_KEY_CHECKS = 0;" >> "$dump_file"
        mysqldump -h "$DB_HOST" -u "$DB_USER" $options "$DB_NAME" "$table" >> "$dump_file"
        echo "SET FOREIGN_KEY_CHECKS = 1;" >> "$dump_file"
        
        local end_time=$(date +"%H:%M:%S")
        echo "Backing up table $table done at $end_time"
    done
}

mkdir -p ./mysqldb-productiondata

# echo "Backing up table structures"
backup_structure

# backup_all_tables "--no-tablespaces --no-create-info"

TABLES_ALL="abonnementen abonnementsvorm_fietsenstalling abonnementsvorm_fietstype abonnementsvormen account_transacties accounts accounts_pasids articles articles_templates barcoderegister bezettingsdata_tmp bikeparklog bulkreservering bulkreserveringuitzondering contact_contact contact_fietsenstalling contact_report_settings contacts contacts_faq contacts_fietsberaad documenttemplates externe_apis externe_apis_locaties faq fietsenstalling_plek fietsenstalling_plek_bezetting fietsenstalling_sectie fietsenstalling_sectie_kostenperioden fietsenstallingen fietsenstallingen_services fietsenstallingen_winkansen fietsenstallingtypen fietstypen financialtransactions fmsservice_permit fmsservicelog gemeenteaccounts historischesaldos instellingen klanttypen log lopers loterij_log mailings_lists mailings_members mailings_messages mailings_standaardteksten modules modules_contacts plaats_fietstype presentations presentations_ticker prijswinnaars prijswinnaars_backup prijzen prijzenpot producten rapportageinfo schema_version sectie_fietstype sectie_fietstype_tmp security_roles security_users security_users_sites services sleutelhangerreeksen tariefcodes tariefregels tariefregels_tmp texts tmp_audit_grabbelton_na tmp_audit_grabbelton_voor transacties_archief_tmp transacties_gemeente_totaal transacties_view trekkingen uitzonderingenopeningstijden unieke_bezoekers users_beheerder_log v_ds_surveyareas_parkinglocations vw_fmsservice_errors vw_locations vw_lopende_transacties vw_pasids vw_stallingstegoeden vw_stallingstegoedenexploitant wachtlijst wachtlijst_fietstype wachtlijst_item wachtrij_betalingen wachtrij_pasids wachtrij_sync winkansen winkansen_reminderteksten winkansen_zelf_inzet transacties_archief webservice_log bezettingsdata transacties emails bezettingsdata_day_hour_cache stallingsduur_cache transacties_archief_day_cache user_contact_role user_status wachtrij_transacties"

TABLES_IGNORED="modules_contacts_copy1 tariefregels_copy1 tariefregels_copy2 tariefregels_copy3 tariefregels_copy4 tariefregels_copy5"
VIEWS_IGNORED="v_ds_surveyareas_parkinglocations vw_fmsservice_errors vw_locations vw_lopende_transacties vw_pasids vw_stallingstegoeden vw_stallingstegoedenexploitant"

backup_tables_individual "$TABLES_ALL" "--no-tablespaces --no-create-info"

# echo "add test accounts"
# test user password is bicyclerace2023!!
# echo "INSERT INTO accounts(ID,Email,EncryptedPassword,account_type) VALUES ('TESTUSER-0000-0000-0000-0000000000000001','test-user@veiligstallen.nl','$2a$04$MEulVPUqm1m4kNlxsJ/EJeMApMgmaRfgOMmIlSJaEZt30aH3TJK/.','USER');" >> "$DUMP_FILE"
# echo "INSERT INTO security_users(UserID,RoleID,GroupID,UserName,EncryptedPassword,DisplayName,Status) VALUES('TESTUSER-0000-0000-0000-0000000000000002',9,'intern','admin-user@veiligstallen.nl','$2a$04$MEulVPUqm1m4kNlxsJ/EJeMApMgmaRfgOMmIlSJaEZt30aH3TJK/.','Test Admin #1', 1);" >> "$DUMP_FILE"
# echo "INSERT INTO security_users(UserID,RoleID,GroupID,UserName,EncryptedPassword,DisplayName,Status) VALUES('TESTUSER-0000-0000-0000-0000000000000003',9,'intern','admin-user2@veiligstallen.nl','$2a$04$MEulVPUqm1m4kNlxsJ/EJeMApMgmaRfgOMmIlSJaEZt30aH3TJK/.','Test Admin #2',1);" >> "$DUMP_FILE"

echo "Export complete"