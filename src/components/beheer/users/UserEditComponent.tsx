import React, { useEffect, useState, useRef } from 'react';
import { type z } from 'zod';
import { VSUserRoleValuesNew } from '~/types/users';
import PageTitle from "~/components/PageTitle";
import Button from '@mui/material/Button';
import FormInput from "~/components/Form/FormInput";
import FormSelect from "~/components/Form/FormSelect";
import { UserAccessRight } from './UserAccessRight';
import { getNewRoleLabel, userHasRight } from '~/types/utils';
import { useUser } from '~/hooks/useUser';
import { makeClientApiCall } from '~/utils/client/api-tools';
import { useSession } from 'next-auth/react';
import { VSSecurityTopic } from '~/types/securityprofile';

import type { SecurityUserValidateResponse } from '~/pages/api/protected/security_users/validate';
import { type securityUserCreateSchema, type SecurityUserResponse, type securityUserUpdateSchema } from '~/pages/api/protected/security_users/[id]';
export interface UserEditComponentProps {
    id: string,
    siteID: string | null,
    onClose: (userChanged: boolean, confirmClose: boolean) => void,
}

export const UserEditComponent = (props: UserEditComponentProps) => {
    const { id } = props;
    const { data: session } = useSession();

    type CurrentState = {
      displayName: string,
      newRoleID: VSUserRoleValuesNew,
      userName: string,
      status: boolean,
      password: string,
      confirmPassword: string,
    }

    const isNew = props.id === "new";

    const [displayName, setDisplayName] = useState<string>('');
    const [newRoleID, setNewRoleID] = useState<VSUserRoleValuesNew>(VSUserRoleValuesNew.None);
    const [userName, setUserName] = useState<string>('');
    const [password, setPassword] = useState<string>(''); 

    const [hasFullAdminRight, setHasFullAdminRight] = useState<boolean>(false);
    const [hasLimitedAdminRight, setHasLimitedAdminRight] = useState<boolean>(false);
  
    const [status, setStatus] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    
    const [showPasswordFields, setShowPasswordFields] = useState(isNew);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);

    const [errorMessage, setErrorMessage] = useState<string|null>(null);

    const roleOptions = Object.values(VSUserRoleValuesNew).map(role => ({
      label: getNewRoleLabel(role),
      value: role.toString()
    }));

    const [initialData, setInitialData] = useState<CurrentState>({
      displayName: '',
      newRoleID: VSUserRoleValuesNew.None,
      userName: '',
      status: true,
      password: '',
      confirmPassword: '',
    });

    const { user: activeuser, isLoading: isLoadingUser, error: errorUser, reloadUser } = useUser(id);

    useEffect(() => {
      if (isNew) {
        const randomPassword = generateRandomPassword();
        const initial: CurrentState = {
          displayName: '',
          newRoleID: VSUserRoleValuesNew.None,
          userName: '',
          status: true,
          password: randomPassword,
          confirmPassword: randomPassword,
        };

        setDisplayName(initial.displayName);
        setNewRoleID(initial.newRoleID);
        setUserName(initial.userName);
        setStatus(initial.status);
        setPassword(initial.password);

        setInitialData(initial);
      } else {
        if (activeuser) {
          const initial = {
            displayName: activeuser.DisplayName || initialData.displayName,
            newRoleID: activeuser.securityProfile?.roleId || initialData.newRoleID,
            userName: activeuser.UserName || initialData.userName,
            status: activeuser.Status === "1",
            password: '',
            confirmPassword: '',
          };

          setDisplayName(initial.displayName);
          setNewRoleID(initial.newRoleID);
          setUserName(initial.userName);
          setStatus(initial.status);

          setInitialData(initial);
        }
      }
    }, [id, activeuser, isNew]);

    useEffect(() => {
      // Focus the name field when the component mounts
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, []);

    // Check if user has correct access rights
    useEffect(() => {
      // dataeigenaar_admin has admin & limited admin rights
      if(userHasRight(session?.user?.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin)) {
        setHasFullAdminRight(true);
        setHasLimitedAdminRight(true);
      }
      // dataeigenaar_beperkt has limited admin rights
      else if(userHasRight(session?.user?.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt)) {
        setHasLimitedAdminRight(true);
      }
    }, [session?.user]);

    const isDataChanged = (): boolean => {
      if (isNew) {
        return displayName !== "" || userName !== "" || password !== "";
      }
      return (
        displayName !== initialData.displayName ||
        newRoleID !== initialData.newRoleID ||
        userName !== initialData.userName ||
        status !== initialData.status ||
        (isChangingPassword && password !== "")
      );
    };

    const validateData = async (data: z.infer<typeof securityUserCreateSchema> | z.infer<typeof securityUserUpdateSchema>) => {
      const responseValidate = await makeClientApiCall<SecurityUserValidateResponse>(`/api/protected/security_users/validate/`, 'POST', data);
      if(!responseValidate.success) {
        setErrorMessage(`Kan gebruikersdata niet valideren: (${responseValidate.error})`);
        return false;
      }

      if (!responseValidate.result.valid) {
        setErrorMessage(responseValidate.result.message);
        return false;
      }

      return true;
    }

    const handleUpdate = async () => {
      try {
        if(isNew) {
          if (!displayName || !userName || !newRoleID || !status ) {
            setErrorMessage("Naam, Gebruikersnaam, Rol en Status zijn verplicht.");
            return;
          }
  
          const data: z.infer<typeof securityUserCreateSchema> = {
            UserID: id,
            DisplayName: displayName,
            RoleID: newRoleID,
            UserName: userName,
            password: password,
            Status: status ? "1" : "0",
            SiteID: props.siteID,
          }

          if(!await validateData(data)) {
            return;
          }
  
          const response = await makeClientApiCall<SecurityUserResponse>(`/api/protected/security_users/${id}`, 'POST', data);
          if(!response.success) {
            setErrorMessage(`Kan gebruikersdata niet opslaan: (${response.error})`);
            return;
          }
    
          if (response.result?.error) {
            console.error("API Error Response:", response.result?.error || 'Onbekende fout bij het opslaan van de gebruiker');
            setErrorMessage('Fout bij het opslaan van de gebruiker');
          }
        } else {
            const data: z.infer<typeof securityUserUpdateSchema> = {
              UserID: id,
              DisplayName: displayName,
              RoleID: newRoleID,
              UserName: userName,
              password: password,
              Status: status ? "1" : "0",
              SiteID: props.siteID,
            }

            if(!await validateData(data)) {
              return;
            }
    
            const response = await makeClientApiCall<SecurityUserResponse>(`/api/protected/security_users/${id}`,"PUT", data);
            if(!response.success) {
              setErrorMessage(`Kan gebruikersdata niet opslaan: (${response.error})`);
              return;
            }
      
            if (response.result?.error) {
              console.error("API Error Response:", response.result?.error || 'Onbekende fout bij het opslaan van de gebruiker');
              setErrorMessage('Fout bij het opslaan van de gebruiker');
            }
    
            // // Change the role if it is changed
            // if (newRoleID !== initialData.newRoleID) {
            //   const urlChangeRole = `/api/protected/security_users/${id}/change_role`;
            //   const responseChangeRole = await makeClientApiCall<SecurityUserResponse>(urlChangeRole, 'POST', { roleId: newRoleID });
    
            //   if(!responseChangeRole.success) {
            //     setErrorMessage(`Kan gebruikersrol niet wijzigen: (${responseChangeRole.error})`);
            //     return;
            //   }
        
            //   if (responseChangeRole.result?.error) {
            //     console.error("API Error Response:", responseChangeRole.result?.error || 'Onbekende fout bij het opslaan van de gebruiker');
            //     setErrorMessage('Fout bij het opslaan van de gebruiker');
            //   }
            // }
            // }
        }
        
        // Check if password was changed and show email dialog
        // For new users or when password was actually changed
        if (isNew || (isChangingPassword && password)) {
          setShowEmailDialog(true);
        } else {
          if (props.onClose) {
            props.onClose(true, false);
          }
        }
      } catch (error) {
        setError('Error: ' + error);
      }
    };

    const handleReset = () => {
      if (isNew) {
        setDisplayName('');
        setNewRoleID(VSUserRoleValuesNew.None);
        setUserName('');
        setPassword('');
        setStatus(true);
        setShowPasswordFields(true);
      } else {
        setDisplayName(initialData.displayName);
        setNewRoleID(initialData.newRoleID);
        setUserName(initialData.userName);
        setPassword('');
        setStatus(initialData.status);
        setShowPasswordFields(false);
      }
      setError(null);
    };

    const generateRandomPassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let password = '';
      for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const handleChangePassword = () => {
      const randomPassword = generateRandomPassword();
      setNewPassword(randomPassword);
      setPassword(randomPassword); // Update main password state
      setIsChangingPassword(true);
      setShowPassword(true);
    };

    const handleCancelPasswordChange = () => {
      setIsChangingPassword(false);
      setNewPassword('');
      setPassword(''); // Reset main password state
      setShowPassword(false);
    };

    // Auto-save password changes when user types
    const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setNewPassword(value);
      setPassword(value);
    };


    const sendEmail = () => {
      const to = userName;
      const subject = 'Welkom bij het Dashboard Deelmobiliteit!';
      const currentPassword = isChangingPassword ? newPassword : password;
      const body = `Beste ${displayName},

Welkom bij het Dashboard Deelmobiliteit! Mocht je vragen of feedback hebben, neem dan vooral contact op met info@dashboarddeelmobiliteit.nl

Hierbij stuur ik je inloggegevens voor https://dashboarddeelmobiliteit.nl/login

Gebruikersnaam: ${userName}
Wachtwoord: ${currentPassword}

`;

      // Create mailto URL with encoded parameters
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Open the default email client
      window.open(mailtoUrl, '_blank');
    };

    const handleEmailDialog = (shouldEmail: boolean) => {
      if (shouldEmail) {
        sendEmail();
      }
      setShowEmailDialog(false);
      if (props.onClose) {
        props.onClose(true, false);
      }
    };


    const renderTopBar = () => {
      const title = isNew ? "Nieuwe gebruiker" : "Bewerk gebruiker";
      const allowSave = isDataChanged();

      return (
        <PageTitle className="flex w-full justify-center sm:justify-start">
          <div className="mr-4 hidden sm:block">
            {title}
          </div>
          <Button
            key="b-1"
            className="mt-3 sm:mt-0"
            onClick={handleUpdate}
            disabled={!allowSave}
          >
            Opslaan
          </Button>
          {!isNew && (
            <Button
              key="b-3"
              className="ml-2 mt-3 sm:mt-0"
              onClick={handleReset}
              disabled={!isDataChanged()}
            >
              Herstel
            </Button>
          )}
        </PageTitle>
      );
    };

    return (
      <div style={{ minHeight: "65vh" }}>
        {renderTopBar()}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <div className="mt-4 w-full">
          {errorMessage && (
            <div className="text-red-600 font-bold mb-4">
              {errorMessage}
            </div>
          )}
          <FormInput 
            label="Naam"
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)} 
            required 
            disabled={! hasLimitedAdminRight}
            autoComplete="off"
            innerRef={nameInputRef}
          />
          <br />
          <FormSelect 
            label="Rol"
            value={newRoleID} 
            onChange={(e) => setNewRoleID(e.target.value as VSUserRoleValuesNew)}
            required
            options={roleOptions}
            disabled={! hasFullAdminRight}
          />
          <br />
          <FormInput 
            label="Gebruikersnaam / e-mail"
            value={userName} 
            onChange={(e) => setUserName(e.target.value)} 
            required 
            type="email"
            disabled={! hasLimitedAdminRight}
            autoComplete="new-email"
          />
          <br />
        {isNew ? (
          // New user - show simplified password field
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wachtwoord
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!hasLimitedAdminRight}
                autoComplete="new-password"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => {
                  const randomPwd = generateRandomPassword();
                  setPassword(randomPwd);
                }}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded whitespace-nowrap"
                disabled={!hasLimitedAdminRight}
              >
                Random
              </button>
            </div>
          </div>
        ) : isChangingPassword ? (
            // Changing password - show new password fields
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nieuw wachtwoord
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPassword}
                    onChange={handleNewPasswordChange}
                    disabled={!hasLimitedAdminRight}
                    autoComplete="new-password"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={handleCancelPasswordChange}
                    className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded whitespace-nowrap"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const randomPwd = generateRandomPassword();
                      setNewPassword(randomPwd);
                      setPassword(randomPwd);
                    }}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded whitespace-nowrap"
                    disabled={!hasLimitedAdminRight}
                  >
                    Random
                  </button>
                </div>
              </div>
            </>
          ) : (
            // Existing user - show change password button
            <div className="mb-4">
              <button
                type="button"
                onClick={handleChangePassword}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                disabled={!hasLimitedAdminRight}
              >
                Wachtwoord wijzigen
              </button>
            </div>
          )}
          <br />
          <div className="flex items-center space-x-4">
            <label className={`flex items-center ${(! hasLimitedAdminRight) ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input 
                type="radio" 
                name="status" 
                value="1" 
                checked={status} 
                onChange={() => setStatus(true)} 
                disabled={! hasLimitedAdminRight}
                className="mr-2"
              />
              Actief
            </label>
            <label className={`flex items-center ${(! hasLimitedAdminRight) ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input 
                type="radio" 
                name="status" 
                value="0" 
                checked={!status} 
                onChange={() => setStatus(false)} 
                disabled={! hasLimitedAdminRight}
                className="mr-2"
              />
              Niet Actief
            </label>
          </div>
        </div>

        {!isNew && (
          <div className="mt-6 w-full h-full">
            <UserAccessRight newRoleID={newRoleID} showRoleInfo={true} />
          </div>
        )}
        
        {showEmailDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">
                {isNew ? "Nieuwe gebruiker aangemaakt" : "Wachtwoord gewijzigd"}
              </h3>
              <p className="mb-4">
                {isNew 
                  ? "U heeft een nieuwe gebruiker aangemaakt. Wilt u een email met inloggegevens versturen?"
                  : "U heeft het wachtwoord van deze gebruiker gewijzigd. Wilt u een email met inloggegevens versturen?"
                }
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => handleEmailDialog(false)}
                  className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                >
                  Nee
                </button>
                <button
                  onClick={() => handleEmailDialog(true)}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Ja
                </button>
              </div>
            </div>
          </div>
        )}
        
      </div>
    );
  };
