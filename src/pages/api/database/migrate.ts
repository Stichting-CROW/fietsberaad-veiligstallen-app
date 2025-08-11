import type { NextApiRequest, NextApiResponse } from "next";
import { getUserContactRoleTableStatus, createUserContactRoleTable, updateUserContactRoleTable, dropUserContactRoleTable } from "~/backend/services/database/UserContactTableActions";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    console.log("*** Database migration started");
    
    // Check if user_contact_role table exists
    let tableStatus = await getUserContactRoleTableStatus({ action: 'status' });
    console.log("*** user_contact_role table status 1", tableStatus);

    // 
    if(!tableStatus) {
      console.log("Unable to determine user_contact_role table status: aborting migration");
      res.status(500).json({ error: "Unable to determine table status: aborting migration" });
      return;
    }

    if(tableStatus.status === 'available') {
      console.log("user_contact_role table already exists, skipping migration");
      res.status(500).json({ 
        success: true, 
        message: "Migration skipped",
      });
      return;
    }

    // NB - only for testing: may delete user made changes in the table
    // if(tableStatus.status === 'available') {
    //   console.log("*** user_contact_role table missing, dropping...");
    //   const dropresult = await dropUserContactRoleTable({ action: 'droptable' });
    //   console.log("*** user_contact_role table dropresult", dropresult);
    //   if(dropresult) {
    //     console.log("*** user_contact_role table dropped successfully");
    //   } else {
    //     console.error("*** Failed to drop user_contact_role table");
    //     res.status(500).json({ error: "Failed to drop user_contact_role table" });
    //     return;
    //   }
    //   tableStatus = await getUserContactRoleTableStatus({ action: 'status' });
    //   console.log("*** user_contact_role table status 2", tableStatus);
    // }
    
    if (tableStatus.status === 'missing') {
      console.log("*** user_contact_role table missing, creating...");
      
      // Create the table
      const createResult = await createUserContactRoleTable({ action: 'createtable' });
      if (!createResult) {
        console.error("*** Failed to create user_contact_role table");
        res.status(500).json({ error: "Failed to create user_contact_role table" });
        return;
      }
      
      console.log("*** user_contact_role table created successfully");

      // Fill the table based on the current database state
      console.log("*** Updating user_contact_role table...");
      const updateResult = await updateUserContactRoleTable({ action: 'update' });
      
      if (!updateResult) {
        console.error("*** Failed to update user_contact_role table");
        res.status(500).json({ error: "Failed to update user_contact_role table" });
        return;
      } else {
        console.log("*** user_contact_role table updated successfully");
        console.log("*** user_contact_role table status", updateResult);
      }
    } else {
      console.log("*** user_contact_role table already exists");
    }
    
    console.log("*** Database migration completed successfully");
    res.status(200).json({ 
      success: true, 
      message: "Database migrated successfully",
    });
    
  } catch (error) {
    console.error("*** Database migration error:", error);
    res.status(500).json({ 
      error: "Database migration failed", 
      details: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}
