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

const stallingenIDs_utrecht = [
    'E197BE1D-B9CC-9B59-D88D7A356D6FEEE8',
    'E197C7FD-C31E-050A-EAB81894CEB8C946',
    'E197C889-9EB9-5F9B-AEA4F4D7B993E795',
    'E197CD25-9F4F-A2D5-26007A22650A4DC0',
    'E197D9DC-C0B9-D9B2-9737C96AED1E68B0',
    'E197DD9B-C7B6-C306-07C6F96E7F42A79B',
    'E197EB66-A859-3EDA-D243C3789EEAE4F0',
    'E198D753-B00C-0F41-9A8C0F275D822E6D',
    'E199038B-DF30-10EB-93C7A52E7AA26808',
    'E1991A95-08EF-F11D-FF946CE1AA0578FB',
    'E199235E-A49E-734E-67A5836FA2358C14',
    'E1994219-9047-F340-067A1D64587BC21D',
    'E1994396-D16A-35F2-2D710CBCEC414338',    
]

// +++++++++++++++++++++++++++++++++++++++++++
// Fill these fields

const username = "";
const email = "";
const password = "";
const roleID = c_root_admin;

// +++++++++++++++++++++++++++++++++++++++++++
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
// const newUserUUID = generateCustomId();
const newUserUUID = "D4351342-685D-D17A-B3617EEBBF39451C";


const sqluser = `INSERT INTO 'security_users' (
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

            const sql = [];
            sql.push(sqluser);

stallingenIDs_utrecht.forEach((stallingID, idx) => {
    const sqlstalling = `INSERT INTO security_users_sites (ID,UserID,SiteID,IsContact) VALUES (${1000000+idx},'${newUserUUID}','${stallingID}','0');`
    sql.push(sqlstalling);
});

fs.writeFileSync('create-test-user.sql', sql.join('\n'));
// console.log(sql);
