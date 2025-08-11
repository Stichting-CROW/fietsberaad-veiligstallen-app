const fs = require('fs');
const bcrypt = require('bcryptjs');

const saltRounds = 13; // 13 salt rounds used in the original code

// +++++++++++++++++++++++++++++++++++++++++++
// Get command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
    console.error('Usage: node set-password-for-user.js <email> <new_password>');
    console.error('Example: node set-password-for-user.js user@example.com newpassword123');
    process.exit(1);
}

const email = args[0];
const password = args[1];

// +++++++++++++++++++++++++++++++++++++++++++

const hashedPassword = bcrypt.hashSync(password, saltRounds);

const sqlUpdatePassword = `UPDATE security_users 
SET EncryptedPassword = '${hashedPassword}'
WHERE UserName = '${email}';`;

const sql = [];
sql.push(sqlUpdatePassword);

fs.writeFileSync('set-password-for-user.sql', sql.join('\n'));
console.log(`Password update SQL generated for user: ${email}`);
console.log('SQL file created: set-password-for-user.sql');
