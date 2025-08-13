import React from 'react';
import type { VSContact } from "~/types/contacts";
import type { VSUserWithRolesNew } from "~/types/users";
import { getNewRoleLabel } from '~/types/utils';

interface ContactusersProps {
  contact: VSContact | undefined;
  users: VSUserWithRolesNew[] | undefined;
  onEditUser: (stallingID: string | undefined) => void;
  onSendPassword?: (userID: string | undefined) => void;
}

const ContactUsers: React.FC<ContactusersProps> = ({ users, onEditUser, onSendPassword }) => {
  return (
    <div>
      <div className="flex justify-between my-2">
      </div>
      
      <div className="overflow-auto max-h-90">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="py-2">Naam</th>
              <th className="py-2">Email</th>
              <th className="py-2">Rol</th>
              <th className="py-2">Actief</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={'user-' + user.UserID}>
                <td className="border px-4 py-2">{user.DisplayName}</td>
                <td className="border px-4 py-2">{user.UserName}</td>
                <td className="border px-4 py-2">{getNewRoleLabel(user.securityProfile.roleId)}</td>
                <td className="border px-4 py-2">
                  {user.Status === "1" ? 
                    <span className="text-green-500">●</span> : 
                    <span className="text-red-500">●</span>
                  }
                </td>
                <td className="border px-4 py-2">
                  <button className="text-yellow-500 mx-1 disabled:opacity-40" onClick={() => onEditUser(user.UserID)}>✏️</button>
                  <button className="text-red-500 mx-1 disabled:opacity-40">🗑️</button>
                  <button className={`text-green-500 mx-1 disabled:opacity-40 ${!onSendPassword ? "disabled" : ""}`}  onClick={() => onSendPassword && onSendPassword(user.UserID)}>✉️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContactUsers;
