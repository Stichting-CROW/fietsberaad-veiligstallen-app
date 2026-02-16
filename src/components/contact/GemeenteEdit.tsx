import React, { useEffect, useState } from 'react';
import GemeenteMapEditor from "~/components/contact/GemeenteMapEditor";
import { Tabs, Tab, Slider, Typography } from '@mui/material';
import type { VSFietsenstallingType } from "~/types/parking";
import FormInput from "~/components/Form/FormInput";
import FormTimeInput from "~/components/Form/FormTimeInput";
import ContactEditLogo from "~/components/contact/ContactEditLogo";
import SectionBlockEdit from "~/components/SectionBlock";
import PageTitle from "~/components/PageTitle";
import Button from '@mui/material/Button';
import { useSession } from "next-auth/react";

import { type VSContactGemeente, VSContactItemType } from '~/types/contacts';
import type { GemeenteValidateResponse } from '~/pages/api/protected/gemeenten/validate';

// import ContactUsers from './ContactUsers';
import FormSelect from '../Form/FormSelect';
import { useGemeente } from '~/hooks/useGemeente';
import { useUsers } from '~/hooks/useUsers';
import { useModulesContacts } from '~/hooks/useModulesContacts';
import { getDefaultNewGemeente } from '~/types/database';
import { makeClientApiCall } from '~/utils/client/api-tools';
import { type GemeenteResponse } from '~/pages/api/protected/gemeenten/[id]';
import { FormGroup, FormLabel, FormControlLabel, Checkbox } from '@mui/material';
import { AVAILABLE_MODULES } from '~/types/modules';
import { userHasRight } from '~/types/utils';
import { VSSecurityTopic } from '~/types/securityprofile';

type GemeenteEditProps = {
    id: string;
    fietsenstallingtypen: VSFietsenstallingType[]; 
    onClose?: (confirmClose: boolean) => void;
}

const DEFAULTGEMEENTE: VSContactGemeente = getDefaultNewGemeente("Data-eigenaar " + new Date().toISOString().slice(0, 16).replace('T', ' '));

const GemeenteEdit = (props: GemeenteEditProps) => {
    const [selectedTab, setSelectedTab] = useState<string>("tab-algemeen");
    const [isEditing, setIsEditing] = useState(!!props.onClose);
    const { data: session } = useSession();

    const { gemeente: activecontact, isLoading: isLoading, error: error, reloadGemeente: reloadGemeente } = useGemeente(props.id);
    const { modulesContacts, loading: modulesLoading, error: modulesError, createModulesContacts, deleteModulesContactsForContact } = useModulesContacts(props.id === "new" ? undefined : props.id);
    const { users: contactpersons, reloadUsers } = useUsers(props.id);

    // Check if user is editing from within a data-owner organization (not fietsberaad)
    // Hide restricted fields when editing a non-fietsberaad organization from within that organization
    const isDataOwnerEdit = props.id !== "1" && session?.user?.activeContactId === props.id;
    
    // Check if user has fietsberaad admin rights (can edit Gemeentecode)
    const hasFietsberaadAdmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_admin);
    const hasFietsberaadSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
    const canEditGemeentecode = hasFietsberaadAdmin || hasFietsberaadSuperadmin;

    type CurrentState = {
      CompanyName: string|null,
      AlternativeCompanyName: string|null,
      UrlName: string|null,
      contactID: string|null,
      ZipID: string|null,
      Gemeentecode: number|null,
      Helpdesk: string|null,
      DayBeginsAt: Date|null,
      Coordinaten: string|null,
      Zoom: number,
      Bankrekeningnr: string|null,
      PlaatsBank: string|null,
      Tnv: string|null,
      Notes: string|null,
      DateRegistration: Date|null,
      Modules: string,
      selectedModules: string[],
      ThemeColor1: string|null,
      ThemeColor2: string|null
    }
  
    const isNew = props.id === "new";

    // const [contactpersons, setContactPersons] = useState<VSUsersForContact[]>([]);
    const [CompanyName, setCompanyName] = useState<string|null>(null);
    const [AlternativeCompanyName, setAlternativeCompanyName] = useState<string|null>(null);
    const [UrlName, setUrlName] = useState<string|null>(null);
    const [ZipID, setZipID] = useState<string|null>(null);
    const [Gemeentecode, setGemeentecode] = useState<number|null>(null);
    const [Helpdesk, setHelpdesk] = useState<string|null>(null);
    const [DayBeginsAt, setDayBeginsAt] = useState<Date|null>(null);
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [newCoordinaten, setNewCoordinaten] = useState<string | undefined>(undefined);
    const [newZoom, setNewZoom] = useState<number | undefined>(undefined);
    const [Bankrekeningnr, setBankrekeningnr] = useState<string|null>(null);
    const [PlaatsBank, setPlaatsBank] = useState<string|null>(null);
    const [Tnv, setTnv] = useState<string|null>(null);
    const [Notes, setNotes] = useState<string|null>(null);
    const [DateRegistration, setDateRegistration] = useState<Date|null>(null);
    const [contactID, setContactID] = useState<string|null>(null);
    const [errorMessage, setErrorMessage] = useState<string|null>(null);
    const [ThemeColor1, setThemeColor1] = useState<string|null>(null);
    const [ThemeColor2, setThemeColor2] = useState<string|null>(null);
  
    const cDefaultCoordinaten = [52.1326, 5.2913].join(","); // center of NL by default 
  
    const [initialData, setInitialData] = useState<CurrentState>({
      CompanyName: '',
      AlternativeCompanyName: null,
      UrlName: null,
      contactID: null,
      ZipID: null,
      Gemeentecode: null,
      Helpdesk: null,
      DayBeginsAt: null,
      Coordinaten: cDefaultCoordinaten,
      Zoom: 13,
      Bankrekeningnr: null,
      PlaatsBank: null,
      Tnv: null,
      Notes: null,
      DateRegistration: null,
      Modules: "",
      selectedModules: [],
      ThemeColor1: null,
      ThemeColor2: null,
    });

    useEffect(() => {
      if (modulesContacts) {
        const moduleIds = modulesContacts.map(mc => mc.ModuleID);
        setSelectedModules(moduleIds);
      }
    }, [modulesContacts]);

    // useEffect(() => {
    //   const fetchUsers = async () => {
    //     const response = await fetch(`/api/protected/gemeenten/${props.id}/contactpersons`);
    //     const responsejson = await response.json() as unknown as VSUsersForContactResponse;
    //     const contactpersons = responsejson.data.filter(user => ["rootadmin", "admin", "editor"].includes(user.NewRoleID));
    //     setContactPersons(contactpersons); 
    //   }

    //   fetchUsers();
    // }, [props.id]);
  
    useEffect(() => {
        if (isNew) {
            // Use default values for new record
            const initial: CurrentState = {
                CompanyName: DEFAULTGEMEENTE.CompanyName,
                AlternativeCompanyName: DEFAULTGEMEENTE.AlternativeCompanyName,
                UrlName: DEFAULTGEMEENTE.UrlName,
                contactID: null,
                ZipID: DEFAULTGEMEENTE.ZipID,
                Gemeentecode: null,
                Helpdesk: DEFAULTGEMEENTE.Helpdesk,
                DayBeginsAt: DEFAULTGEMEENTE.DayBeginsAt,
                Coordinaten: DEFAULTGEMEENTE.Coordinaten,
                Zoom: DEFAULTGEMEENTE.Zoom,
                Bankrekeningnr: DEFAULTGEMEENTE.Bankrekeningnr,
                PlaatsBank: DEFAULTGEMEENTE.PlaatsBank,
                Tnv: DEFAULTGEMEENTE.Tnv,
                Notes: DEFAULTGEMEENTE.Notes,
                DateRegistration: DEFAULTGEMEENTE.DateRegistration,
                Modules: "",
                selectedModules: [],
                ThemeColor1: DEFAULTGEMEENTE.ThemeColor1 ? DEFAULTGEMEENTE.ThemeColor1.replace('#', '') : '1f99d2',
                ThemeColor2: DEFAULTGEMEENTE.ThemeColor2 ? DEFAULTGEMEENTE.ThemeColor2.replace('#', '') : '96c11f',
            };

            setCompanyName(initial.CompanyName);
            setAlternativeCompanyName(initial.AlternativeCompanyName);
            setUrlName(initial.UrlName);
            setZipID(initial.ZipID);
            setGemeentecode(initial.Gemeentecode);
            setHelpdesk(initial.Helpdesk);
            setDayBeginsAt(initial.DayBeginsAt);
            setNewCoordinaten(undefined);
            setNewZoom(undefined);
            setBankrekeningnr(initial.Bankrekeningnr);
            setPlaatsBank(initial.PlaatsBank);
            setTnv(initial.Tnv);
            setNotes(initial.Notes);
            setDateRegistration(initial.DateRegistration);
            setSelectedModules([]);
            setThemeColor1(initial.ThemeColor1);
            setThemeColor2(initial.ThemeColor2);

            setInitialData(initial);
        } else {
            if (activecontact) {
                // Get current modules for this contact
                const currentModules = modulesContacts
                    .filter(mc => mc.SiteID === props.id)
                    .map(mc => mc.ModuleID);

                const initial = {
                    CompanyName: activecontact.CompanyName || initialData.CompanyName,
                    AlternativeCompanyName: activecontact.AlternativeCompanyName || initialData.AlternativeCompanyName,
                    UrlName: activecontact.UrlName || initialData.UrlName,
                    contactID: null, // Will be set below if contactpersons are available
                    ZipID: activecontact.ZipID || initialData.ZipID,
                    Gemeentecode: activecontact.Gemeentecode || initialData.Gemeentecode,
                    Helpdesk: activecontact.Helpdesk || initialData.Helpdesk,
                    DayBeginsAt: activecontact.DayBeginsAt || initialData.DayBeginsAt,
                    Coordinaten: activecontact.Coordinaten || initialData.Coordinaten,
                    Zoom: activecontact.Zoom || initialData.Zoom,
                    Bankrekeningnr: activecontact.Bankrekeningnr || initialData.Bankrekeningnr,
                    PlaatsBank: activecontact.PlaatsBank || initialData.PlaatsBank,
                    Tnv: activecontact.Tnv || initialData.Tnv,
                    Notes: activecontact.Notes || initialData.Notes,
                    DateRegistration: activecontact.DateRegistration || initialData.DateRegistration,
                    Modules: "",
                    selectedModules: currentModules,
                    ThemeColor1: activecontact.ThemeColor1 || initialData.ThemeColor1,
                    ThemeColor2: activecontact.ThemeColor2 || initialData.ThemeColor2,
                };
        
                setCompanyName(initial.CompanyName);
                setAlternativeCompanyName(initial.AlternativeCompanyName);
                setUrlName(initial.UrlName);
                setZipID(initial.ZipID);
                setGemeentecode(initial.Gemeentecode);
                setHelpdesk(initial.Helpdesk);
                setDayBeginsAt(initial.DayBeginsAt);
                setNewCoordinaten(undefined);
                setNewZoom(undefined);
                setBankrekeningnr(initial.Bankrekeningnr);
                setPlaatsBank(initial.PlaatsBank);
                setTnv(initial.Tnv);
                setNotes(initial.Notes);
                setDateRegistration(initial.DateRegistration);
                setThemeColor1(initial.ThemeColor1);
                setThemeColor2(initial.ThemeColor2);
        
                setInitialData(initial);
                
                // Set default contact person if available
                if (contactpersons.length > 0) {
                    // Find the user who is marked as the contact person for this gemeente
                    const contactPerson = contactpersons.find(user => user.isContact);
                    
                    if (contactPerson) {
                        setContactID(contactPerson.UserID);
                    }
                }
            }
        }
    }, [props.id, activecontact, isNew, modulesContacts, contactpersons]);

    const isDataChanged = () => {
      if (isNew) {
        const currentCoordinaten = newCoordinaten !== undefined ? newCoordinaten : (initialData.Coordinaten || '');
        const currentZoom = newZoom !== undefined ? newZoom : (initialData.Zoom || 13);
        return !!CompanyName || !!ZipID || !!DayBeginsAt || !!currentCoordinaten || !!currentZoom || selectedModules.length > 0;
      }

      return (
          CompanyName !== initialData.CompanyName ||
          AlternativeCompanyName !== initialData.AlternativeCompanyName ||
          UrlName !== initialData.UrlName ||
          contactID !== initialData.contactID ||
          ZipID !== initialData.ZipID ||
          Gemeentecode !== initialData.Gemeentecode ||
          Helpdesk !== initialData.Helpdesk ||
          DayBeginsAt !== initialData.DayBeginsAt ||
          (newCoordinaten !== undefined && newCoordinaten !== initialData.Coordinaten) ||
          (newZoom !== undefined && newZoom !== initialData.Zoom) ||
          Bankrekeningnr !== initialData.Bankrekeningnr ||
          PlaatsBank !== initialData.PlaatsBank ||
          Tnv !== initialData.Tnv ||
          Notes !== initialData.Notes ||
          DateRegistration !== initialData.DateRegistration ||
          selectedModules.length !== initialData.selectedModules.length ||
          selectedModules.some(module => !initialData.selectedModules.includes(module)) ||
          initialData.selectedModules.some(module => !selectedModules.includes(module)) ||
          ThemeColor1 !== initialData.ThemeColor1 ||
          ThemeColor2 !== initialData.ThemeColor2
      );
    };

    const handleModuleChange = (moduleId: string, checked: boolean) => {
      if (checked) {
        setSelectedModules(prev => [...prev, moduleId]);
      } else {
        setSelectedModules(prev => prev.filter(id => id !== moduleId));
      }
    };

    const saveModules = async () => {
      if (!props.id || props.id === "new") return;

      try {
        // First delete all existing modules for this contact
        await deleteModulesContactsForContact(props.id);

        // Then create the new selected modules
        if (selectedModules.length > 0) {
          const modulesData = selectedModules.map(moduleId => ({
            ModuleID: moduleId,
            SiteID: props.id
          }));
          await createModulesContacts(modulesData);
        }
      } catch (error) {
        console.error('Error saving modules:', error);
        setErrorMessage('Fout bij het opslaan van modules: ' + (error instanceof Error ? error.message : String(error)));
      }
    };

    const saveContactPerson = async () => {
      if (!props.id || props.id === "new") return;

      try {
        // Get the previous contact person from initial data
        const previousContactID = initialData.contactID;
        const newContactID = contactID;

        // If the contact person has changed, update the database
        if (previousContactID !== newContactID) {
          const response = await fetch(`/api/protected/gemeenten/${props.id}/contactperson`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactID: newContactID })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Reload the users data to get updated isContact flags
          await reloadUsers();
          
          // Update the initial data to reflect the saved contact person
          setInitialData(prev => ({
            ...prev,
            contactID: newContactID
          }));
        }
      } catch (error) {
        console.error('Error saving contact person:', error);
        setErrorMessage('Fout bij het opslaan van contactpersoon: ' + (error instanceof Error ? error.message : String(error)));
      }
    };
    
      const handleUpdate = async () => {
        // Get current coordinate value (newCoordinaten if changed, otherwise initialData)
        const currentCoordinaten = newCoordinaten !== undefined ? newCoordinaten : (initialData.Coordinaten || '');
        
        // For data-owner edits, ZipID is not required (it's hidden)
        const requiredFields = isDataOwnerEdit 
          ? { CompanyName, DayBeginsAt, Coordinaten: currentCoordinaten }
          : { CompanyName, ZipID, DayBeginsAt, Coordinaten: currentCoordinaten };
        
        if (!requiredFields.CompanyName || (!isDataOwnerEdit && !requiredFields.ZipID) || !requiredFields.DayBeginsAt || !requiredFields.Coordinaten) {
          const missingFields = [];
          if (!requiredFields.CompanyName) missingFields.push("Organisatie");
          if (!isDataOwnerEdit && !requiredFields.ZipID) missingFields.push("Postcode ID");
          if (!requiredFields.DayBeginsAt) missingFields.push("Dagstart");
          if (!requiredFields.Coordinaten) missingFields.push("Coördinaten");
          alert(`${missingFields.join(", ")} mogen niet leeg zijn.`);
          return;
        }

        const id = false===isNew ? props.id : 'new';
    
        try {
          const data: Partial<VSContactGemeente> = {
            ID:id,
            ItemType: VSContactItemType.Organizations,
            CompanyName: CompanyName || '',
            // Only include restricted fields if user is not a data-owner editing their own org
            ...(isDataOwnerEdit ? {} : {
              AlternativeCompanyName: AlternativeCompanyName || '',
              UrlName: UrlName || '',
              ZipID: ZipID || '',
            }),
            // Gemeentecode can only be edited by fietsberaad admins
            ...(canEditGemeentecode ? {
              Gemeentecode: Gemeentecode || undefined,
            } : {}),
            Helpdesk: Helpdesk || '',
            DayBeginsAt: DayBeginsAt || undefined,
            Coordinaten: newCoordinaten,
            Zoom: newZoom,
            Bankrekeningnr: Bankrekeningnr || '',
            PlaatsBank: PlaatsBank || '',
            Tnv: Tnv || '',
            Notes: Notes || '',
            DateRegistration: DateRegistration,
            ThemeColor1: ThemeColor1 || undefined,
            ThemeColor2: ThemeColor2 || undefined,
          }

          const urlValidate = `/api/protected/gemeenten/validate/`;
          const responseValidate = await makeClientApiCall<GemeenteValidateResponse>(urlValidate, 'POST', data);
          if(!responseValidate.success) {
            setErrorMessage(`Kan gemeentedata niet valideren: (${responseValidate.error})`);
            return;
          }


          if (!responseValidate.result.valid) {
            setErrorMessage(responseValidate.result.message);
            return;
          }

          const method = isNew ? 'POST' : 'PUT';
          const url = `/api/protected/gemeenten/${id}`;

          const response = await makeClientApiCall<GemeenteResponse>(url, method, data);
          if(!response.success) {
            setErrorMessage(`Kan gemeentedata niet opslaan: (${response.error})`);
            return;
          }
    
          if (!response.result?.error) {
            if (!isNew && props.id) {
              // Only save modules and contact person if user is not a data-owner editing their own org
              if (!isDataOwnerEdit) {
                await saveModules();
                await saveContactPerson();
              }
            }
            
            // Update initialData with saved values to consolidate changes
            const savedCoordinaten = newCoordinaten !== undefined ? newCoordinaten : initialData.Coordinaten;
            const savedZoom = newZoom !== undefined ? newZoom : initialData.Zoom;
            
            setInitialData(prev => ({
              ...prev,
              CompanyName: CompanyName || prev.CompanyName,
              AlternativeCompanyName: AlternativeCompanyName || prev.AlternativeCompanyName,
              UrlName: UrlName || prev.UrlName,
              ZipID: ZipID || prev.ZipID,
              Gemeentecode: Gemeentecode !== null ? Gemeentecode : prev.Gemeentecode,
              Helpdesk: Helpdesk || prev.Helpdesk,
              DayBeginsAt: DayBeginsAt || prev.DayBeginsAt,
              Coordinaten: savedCoordinaten,
              Zoom: savedZoom,
              Bankrekeningnr: Bankrekeningnr || prev.Bankrekeningnr,
              PlaatsBank: PlaatsBank || prev.PlaatsBank,
              Tnv: Tnv || prev.Tnv,
              Notes: Notes || prev.Notes,
              DateRegistration: DateRegistration || prev.DateRegistration,
              ThemeColor1: ThemeColor1 || prev.ThemeColor1,
              ThemeColor2: ThemeColor2 || prev.ThemeColor2,
            }));
            
            // Reset state to use initialData values (consolidate changes)
            // This ensures the map shows only one marker at the saved location
            setNewCoordinaten(undefined);
            setNewZoom(undefined);
            
            // Reload gemeente data to get latest from database
            if (!isNew) {
              await reloadGemeente();
            }
            
            if (props.onClose) {
              props.onClose(false);
            }
          } else {
            console.error("API Error Response:", response.result?.error || 'Onbekende fout bij het opslaan van de gemeente');
            setErrorMessage('Fout bij het opslaan van de gemeente');
          }
        } catch (error) {
          setErrorMessage('Fout: ' + (error instanceof Error ? error.message : String(error)));
        }
      };
    
      const handleReset = () => {
        if (isNew) {
          setCompanyName(null);
          setAlternativeCompanyName(null);
          setUrlName(null);
          setZipID(null);
          setGemeentecode(null);
          setHelpdesk(null);
          setDayBeginsAt(null);
          setNewCoordinaten(undefined);
          setNewZoom(undefined);
          setBankrekeningnr(null);
          setPlaatsBank(null);
          setTnv(null);
          setNotes(null);
          setDateRegistration(null);
          setSelectedModules([]);
          setContactID(null);
          setThemeColor1(null);
          setThemeColor2(null);
        } else {
          setCompanyName(initialData.CompanyName);
          setAlternativeCompanyName(initialData.AlternativeCompanyName);
          setUrlName(initialData.UrlName);
          setZipID(initialData.ZipID);
          setGemeentecode(initialData.Gemeentecode);
          setHelpdesk(initialData.Helpdesk);
          setDayBeginsAt(initialData.DayBeginsAt);
          setNewCoordinaten(undefined);
          setNewZoom(undefined);
          setBankrekeningnr(initialData.Bankrekeningnr);
          setPlaatsBank(initialData.PlaatsBank);
          setTnv(initialData.Tnv);
          setNotes(initialData.Notes);
          setDateRegistration(initialData.DateRegistration);
          setContactID(initialData.contactID);
          setThemeColor1(initialData.ThemeColor1);
          setThemeColor2(initialData.ThemeColor2);
          if (modulesContacts) {
            const moduleIds = modulesContacts.map(mc => mc.ModuleID);
            setSelectedModules(moduleIds);
          }
        }
      };
    
      const handleCoordinatesChanged = (lat: number, lng: number) => {
        const latlngstring = `${lat},${lng}`;
        const originalCoords = initialData.Coordinaten || '';
        if (latlngstring !== originalCoords) {
          setNewCoordinaten(latlngstring);
        } else {
          setNewCoordinaten(undefined); // Revert to original
        }
      };
    
      const handleZoomChanged = (zoom: number) => {
        const originalZoom = initialData.Zoom || 13;
        if (zoom !== originalZoom) {
          setNewZoom(zoom);
        } else {
          setNewZoom(undefined); // Revert to original
        }
      };
    
      const getCoordinate = (isLat: boolean): string => {
        const coords = newCoordinaten !== undefined ? newCoordinaten : (initialData.Coordinaten || '');
        if (coords === "" || coords === null) return "";
    
        const latlng = coords.split(",");
        if (isLat) {
          return latlng[0]?.toString() || '';
        } else {
          return latlng[1]?.toString() || '';
        }
      }
    
      const handleChange = (event: React.SyntheticEvent, newValue: string) => {
        setSelectedTab(newValue);
      };

      const renderTopBar = (currentContact: VSContactGemeente | undefined) => {
        const contact = isNew ? DEFAULTGEMEENTE : currentContact;
        const title: string = "" + (contact?.CompanyName || "") + (isNew ? " (Nieuw)" : "");
        const showUpdateButtons: boolean = isEditing;
        const allowSave: boolean = isDataChanged();

        return (
            <PageTitle className="flex w-full justify-center sm:justify-start">
                <div className="mr-4 hidden sm:block">
                    {title}
                </div>
                {!isNew && !props.onClose && !isEditing && (
                    <Button
                        key="b-edit"
                        className="mt-3 sm:mt-0"
                        onClick={() => setIsEditing(true)}
                    >
                        Bewerken
                    </Button>
                )}
                {showUpdateButtons && (
                    <>
                        <Button
                            key="b-1"
                            className="mt-3 sm:mt-0"
                            onClick={handleUpdate}
                            disabled={!allowSave}
                        >
                            Opslaan
                        </Button>
                        <Button
                            key="b-3"
                            className="ml-2 mt-3 sm:mt-0"
                            onClick={() => {
                                handleReset();
                                if (props.onClose) {
                                    props.onClose(isDataChanged());
                                } else {
                                    setIsEditing(false);
                                }
                            }}
                        >
                            {props.onClose ? "Terug" : "Herstel"}
                        </Button>
                    </>
                )}
                {!isEditing && props.onClose && (
                    <Button
                        key="b-4"
                        className="ml-2 mt-3 sm:mt-0"
                        onClick={() => props.onClose && props.onClose(isDataChanged())}
                    >
                        Terug
                    </Button>
                )}
            </PageTitle>
        );
    };

    return (
      <div style={{ minHeight: "65vh" }}>
      <div
        className="
          flex justify-between
          sm:mr-8
        "
      >        
        { renderTopBar(activecontact) }
        </div>
            <Tabs value={selectedTab} onChange={handleChange} aria-label="Edit contact">
              <Tab label="Algemeen" value="tab-algemeen" />
              <Tab label="Thema" value="tab-thema" />
              <Tab label="Kaart" value="tab-kaart" />
            </Tabs>
            {selectedTab === "tab-algemeen" && (
              <div className="mt-4 w-full">
                  {errorMessage && (
                    <div className="text-red-600 font-bold mb-4">
                      {errorMessage}
                    </div>
                  )}
                  <FormInput 
                    label="Naam"
                    value={CompanyName || ''} 
                    onChange={(e) => setCompanyName(e.target.value || null)} 
                    required 
                    disabled={!isEditing}
                  />
                  <br />
                  {props.id !== "new" && !isDataOwnerEdit && <>
                    { contactpersons.length > 0 ?
                        <FormSelect 
                          label="Contactpersoon"
                          value={contactID || ''} 
                          onChange={(e) => setContactID(e.target.value || null)} 
                          required
                          options={[
                            { label: "Selecteer een contactpersoon", value: "" },
                            ...contactpersons
                              .filter(user => user.DisplayName !== null && user.DisplayName !== "")
                              .map(user => ({ label: user.DisplayName || "", value: user.UserID }))
                          ]}
                          disabled={!isEditing}
                        /> 
                        : 
                        <FormInput label="Contactpersoon" value="Voor deze gemeente zijn geen gebruikers geregistreerd" disabled />}
                      <br />
                    </>
                  }
                  {!isDataOwnerEdit && <>
                    <FormInput 
                      label="Alternatieve naam"
                      value={AlternativeCompanyName || ''} 
                      onChange={(e) => setAlternativeCompanyName(e.target.value || null)} 
                      disabled={!isEditing}
                    />
                    <br />
                    <FormInput 
                      label="URL vriendelijke naam"
                      value={UrlName || ''} 
                      onChange={(e) => setUrlName(e.target.value || null)} 
                      disabled={!isEditing}
                    />
                    <br />
                  </>}
                  {!isDataOwnerEdit && (
                    <>
                      <FormInput 
                        label="Postcode ID"
                        value={ZipID || ''} 
                        onChange={(e) => setZipID(e.target.value || null)} 
                        required
                        disabled={!isEditing}
                      />
                      <br />
                    </>
                  )}
                  <FormInput 
                    label="Gemeentecode"
                    value={
                      !canEditGemeentecode && Gemeentecode !== null
                        ? Gemeentecode.toString().padStart(4, '0') // Show as 4-digit when read-only
                        : Gemeentecode !== null 
                        ? Gemeentecode.toString() 
                        : ''
                    } 
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      setGemeentecode(value === '' ? null : parseInt(value) || null);
                    }}
                    disabled={!isEditing || !canEditGemeentecode}
                    type={canEditGemeentecode ? "number" : "text"} // Use text when read-only to show padded value
                  />
                  <br />
                  <FormInput 
                    label="Email helpdesk"
                    value={Helpdesk || ''} 
                    onChange={(e) => setHelpdesk(e.target.value || null)} 
                    disabled={!isEditing}
                  />
                  <br />
                  <FormTimeInput 
                    label="Dagstart (tbv. rapportages)"
                    value={DayBeginsAt} 
                    onChange={(newDate: Date|null) => setDayBeginsAt(newDate)} 
                    disabled={!isEditing}
                  />
                  <br />
                  {!isDataOwnerEdit && (
                    <>
                      <div>
                        <b>Modules</b>
                      </div>
                      <FormGroup>
                        {AVAILABLE_MODULES.map((module) => (
                          <FormControlLabel
                            key={module.ID}
                            control={
                              <Checkbox 
                                checked={selectedModules.includes(module.ID)}
                                onChange={(e) => handleModuleChange(module.ID, e.target.checked)}
                                disabled={!isEditing}
                              />
                            }
                            label={module.Name}
                          />
                        ))}
                      </FormGroup>
                    </>
                  )}
                  <br />
                  <FormInput 
                    label="Registratiedatum"
                    value={DateRegistration 
                      ? new Date(DateRegistration).toLocaleDateString('nl-NL', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        }).replace(/\//g, '-')
                      : ''} 
                    disabled={true}
                  />
              </div>
            )}
            {selectedTab === "tab-kaart" && (
              <div className="border px-4 py-2 space-y-4">
                <div className="relative">
                  <GemeenteMapEditor 
                    coordinaten={newCoordinaten !== undefined ? newCoordinaten : (initialData.Coordinaten || '')} 
                    zoom={newZoom !== undefined ? newZoom : (initialData.Zoom || 13)}
                    onCoordinatesChanged={handleCoordinatesChanged}
                    onZoomChanged={handleZoomChanged}
                    disabled={!isEditing}
                  />
                  <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-sm">
                    Klik om de kaart te bewegen
                  </div>
                </div>
                <div className="space-y-4">
                  <Typography variant="h6" className="text-center">
                    Verschuif de kaart om de coordinaten aan te passen
                  </Typography>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="w-56">
                      <FormInput
                        label="Latitude"
                        type="number"
                        value={getCoordinate(true)}
                        disabled={true}
                        placeholder="52.095346"
                      />
                    </div>
                    <div className="w-56">
                      <FormInput
                        label="Longitude"
                        type="number"
                        value={getCoordinate(false)}
                        disabled={true}
                        placeholder="5.108147"
                      />
                    </div>
                    <div>
                      <Typography gutterBottom className="text-sm font-bold">
                        Zoom niveau: {newZoom !== undefined ? newZoom : (initialData.Zoom || 13)}
                      </Typography>
                      <Slider
                        value={newZoom !== undefined ? newZoom : (initialData.Zoom || 13)}
                        onChange={(e, newValue) => {
                          if (typeof newValue === 'number') {
                            handleZoomChanged(newValue);
                          }
                        }}
                        min={0}
                        max={22}
                        step={1}
                        disabled={!isEditing}
                        marks={[
                          { value: 0, label: '0' },
                          { value: 11, label: '11' },
                          { value: 22, label: '22' }
                        ]}
                        valueLabelDisplay="auto"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {selectedTab === "tab-thema" && (
              <div className="border px-4 py-2 space-y-4">
                <SectionBlockEdit heading="Logo">
                { isNew ? (
                    <ContactEditLogo ID={DEFAULTGEMEENTE.ID} CompanyLogo={DEFAULTGEMEENTE.CompanyLogo} CompanyLogo2={DEFAULTGEMEENTE.CompanyLogo2} isLogo2={false} onUpdateAfbeelding={() => reloadGemeente()} />
                ) : activecontact ? (
                    <ContactEditLogo ID={activecontact.ID} CompanyLogo={activecontact.CompanyLogo} CompanyLogo2={activecontact.CompanyLogo2} isLogo2={false} onUpdateAfbeelding={() => reloadGemeente()} />
                ) : (
                    <div>
                        <p>Geen contact geselecteerd</p>
                    </div>
                )}
                </SectionBlockEdit>

                <SectionBlockEdit heading="Logo 2 (optioneel)">
                { isNew ? (
                    <ContactEditLogo ID={DEFAULTGEMEENTE.ID} CompanyLogo={DEFAULTGEMEENTE.CompanyLogo} CompanyLogo2={DEFAULTGEMEENTE.CompanyLogo2} isLogo2={true} onUpdateAfbeelding={() => reloadGemeente()} />
                ) : activecontact ? (
                    <ContactEditLogo ID={activecontact.ID} CompanyLogo={activecontact.CompanyLogo} CompanyLogo2={activecontact.CompanyLogo2} isLogo2={true} onUpdateAfbeelding={() => reloadGemeente()} />
                ) : (
                    <div>
                        <p>Geen contact geselecteerd</p>
                    </div>
                )}
                </SectionBlockEdit>

                <SectionBlockEdit heading="Huisstijlkleuren:">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="relative">
                          <input
                            type="color"
                            value={ThemeColor1 ? `#${ThemeColor1}` : '#1f99d2'}
                            onChange={(e) => {
                              const hex = e.target.value.replace('#', '');
                              setThemeColor1(hex);
                            }}
                            disabled={!isEditing}
                            className="w-12 h-12 border border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ 
                              backgroundColor: ThemeColor1 ? `#${ThemeColor1}` : '#1f99d2',
                              position: 'relative'
                            }}
                          />
                          {isEditing && (
                            <div className="absolute bottom-0 left-0 w-0 h-0 border-l-[8px] border-l-transparent border-b-[8px] border-b-gray-600 pointer-events-none" />
                          )}
                        </div>
                        <FormInput
                          type="text"
                          label="Themakleur 1"
                          value={ThemeColor1 || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace('#', '').toUpperCase();
                            if (value.length <= 6 && /^[0-9A-F]*$/.test(value)) {
                              setThemeColor1(value || null);
                            }
                          }}
                          placeholder="1F99D2"
                          disabled={!isEditing}
                          className="w-32"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="relative">
                          <input
                            type="color"
                            value={ThemeColor2 ? `#${ThemeColor2}` : '#96c11f'}
                            onChange={(e) => {
                              const hex = e.target.value.replace('#', '');
                              setThemeColor2(hex);
                            }}
                            disabled={!isEditing}
                            className="w-12 h-12 border border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ 
                              backgroundColor: ThemeColor2 ? `#${ThemeColor2}` : '#96c11f',
                              position: 'relative'
                            }}
                          />
                          {isEditing && (
                            <div className="absolute bottom-0 left-0 w-0 h-0 border-l-[8px] border-l-transparent border-b-[8px] border-b-gray-600 pointer-events-none" />
                          )}
                        </div>
                        <FormInput
                          type="text"
                          label="Themakleur 2"
                          value={ThemeColor2 || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace('#', '').toUpperCase();
                            if (value.length <= 6 && /^[0-9A-F]*$/.test(value)) {
                              setThemeColor2(value || null);
                            }
                          }}
                          placeholder="96C11F"
                          disabled={!isEditing}
                          className="w-32"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>• De huisstijlkleuren worden gebruikt als basiskleuren in de website.</p>
                    <p>• Kies geen heel lichte kleuren, aangezien de witte letters dan niet meer leesbaar zijn.</p>
                    <p>• NB. Check na het aanpassen van de kleuren altijd of de website er naar wens uitziet.</p>
                  </div>
                </SectionBlockEdit>
              </div>
            )}
        {/* <div className="mt-4">
          <button 
            className={`bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-2 ${!isDataChanged() ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleUpdate}
            disabled={!isDataChanged()}
          >
            Opslaan
          </button>
          <button 
            className={`bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded mr-2 ${!isDataChanged() ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleReset}
            disabled={!isDataChanged()}
          >
            Herstel
          </button>
          <button 
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={() => props.onClose()}
          >
            Back to Overview
          </button>
        </div> */}
      </div>
  );
};

export default GemeenteEdit;