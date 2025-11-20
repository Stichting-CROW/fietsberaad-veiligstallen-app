const fs = require('fs');
const bcrypt = require('bcryptjs');

const c_root_admin = 1; 	//	Super Admin	
const c_intern_admin = 2; 	//	Admin (intern)	
const c_intern_editor = 3; 	//	Redacteur (intern)	
const c_extern_admin = 4; 	//	Admin (gemeente)	
const c_extern_editor = 5; 	//	Redacteur (gemeente)	
const c_exploitant = 6; 	//	Exploitant	
const c_beheerder = 7; 	//	Beheerder	
// const c_exploitant_data_analyst: number = 8; // Exploitant Data Analist -> disabled
const c_intern_data_analyst = 9;
// const c_extern_data_analyst: number = 10; // Extern Data Analist -> disabled

const saltRounds = 13; // 13 salt rounds used in the original code

// +++++++++++++++++++++++++++++++++++++++++++
// Configuration

const username = "superadmin2@veiligstallen.nl";
const email = "superadmin2@veiligstallen.nl";
const password = process.argv[2]; // Get password from command line argument
const roleID = c_root_admin;
const fietsberaadSiteID = "1"; // Fietsberaad site ID

// +++++++++++++++++++++++++++++++++++++++++++

// Check if password is provided
if (!password) {
    console.error("Error: Password must be provided as command line argument");
    console.error("Usage: node create-root-user.js <password>");
    process.exit(1);
}



function generateCustomId() {
    // Function to generate a random hex string of a given length
    const randomHex = (length) => {
        let result = '';
        const characters = '0123456789ABCDEF';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    // Generate segments of the custom ID
    const part1 = randomHex(8);
    const part2 = randomHex(4);
    const part3 = randomHex(4);
    const part4 = randomHex(16);

    // Combine segments into the custom ID format
    return `${part1}-${part2}-${part3}-${part4}`;
}

const hashedPassword = bcrypt.hashSync(password, saltRounds);
const newUserUUID = generateCustomId();
const newContactRoleID = generateCustomId();

// SQL statements array
const sql = [];

// 1. Check if user exists and drop related records
sql.push(`-- Check if user exists for veiligstallen.nl`);
sql.push(`SET @existingUserID = (SELECT UserID FROM security_users WHERE UserName = '${email}' LIMIT 1);`);

sql.push(`-- If user exists, drop related records`);
sql.push(`DELETE FROM security_users_sites WHERE UserID = @existingUserID;`);
sql.push(`DELETE FROM user_contact_role WHERE UserID = @existingUserID;`);
sql.push(`DELETE FROM user_status WHERE UserID = @existingUserID;`);
sql.push(`DELETE FROM security_users WHERE UserID = @existingUserID;`);

// 2. Create new user
const sqluser = `INSERT INTO security_users (
            UserID,
            Locale,
            RoleID,
            GroupID,
            SiteID,
            ParentID,
            UserName,
            EncryptedPassword,
            EncryptedPassword2,
            DisplayName,
            LastLogin,
            SendMailToMailAddress,
            Theme,
            Status) VALUES (
                '${newUserUUID}',
                'Dutch (Standard)',
                ${roleID},
                'intern',
                NULL,
                '',
                '${email}',
                '${hashedPassword}',
                '',
                '${username}',
                '2021-04-06 22:58:13',
                NULL,
                'default',
                '1'
            );`;

sql.push(sqluser);

// 3. Add record to security_users_sites for Fietsberaad (isContact = 0)
const sqlSecurityUserSites = `INSERT INTO security_users_sites (UserID, SiteID, IsContact) VALUES ('${newUserUUID}', '${fietsberaadSiteID}', b'0');`;
sql.push(sqlSecurityUserSites);

// 5. Add record to user_contact_role for Fietsberaad (newRoleID=rootadmin, isOwnOrganization = 1)
const sqlUserContactRole = `INSERT INTO user_contact_role (ID, UserID, ContactID, NewRoleID, isOwnOrganization) VALUES ('${newContactRoleID}', '${newUserUUID}', '${fietsberaadSiteID}', 'rootadmin', 1);`;
sql.push(sqlUserContactRole);

// Write SQL to file
fs.writeFileSync('create-root-user.sql', sql.join('\n'));

console.log('SQL script generated: create-root-user.sql');
console.log(`New user created: ${username}`);
console.log(`User ID: ${newUserUUID}`);
console.log(`Role: Root Admin`);
console.log(`Site: Fietsberaad (ID: ${fietsberaadSiteID})`);
