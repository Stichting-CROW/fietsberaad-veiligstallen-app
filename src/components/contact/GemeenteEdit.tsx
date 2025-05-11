import React, { useEffect, useState } from 'react';
import ParkingEditLocation from "~/components/parking/ParkingEditLocation";
import { Tabs, Tab } from '@mui/material';
// import ContactFietsenstallingen from './ContactFietsenstallingen';
import type { fietsenstallingtypen } from '@prisma/client';
import FormInput from "~/components/Form/FormInput";
import FormTimeInput from "~/components/Form/FormTimeInput";
import ContactEditLogo from "~/components/contact/ContactEditLogo";
import SectionBlockEdit from "~/components/SectionBlock";
import PageTitle from "~/components/PageTitle";
import Button from '@mui/material/Button';

import type { VSContactGemeente } from '~/types/contacts';
import type { GemeenteValidateResponse } from '~/pages/api/protected/gemeenten/validate';

// import ContactUsers from './ContactUsers';
import FormSelect from '../Form/FormSelect';
import { useGemeente } from '~/hooks/useGemeente';
import { useUsers } from '~/hooks/useUsers';
import { getDefaultNewGemeente } from '~/types/database';
import { makeClientApiCall } from '~/utils/client/api-tools';
import { GemeenteResponse } from '~/pages/api/protected/gemeenten/[id]';

type GemeenteEditProps = {
    id: string;
    fietsenstallingtypen: fietsenstallingtypen[]; 
    onClose?: (confirmClose: boolean) => void;
    onEditStalling: (stallingID: string | undefined) => void;
    onEditUser: (userID: string | undefined) => void;
    onSendPassword: (userID: string | undefined) => void;
}

const DEFAULTGEMEENTE: VSContactGemeente = getDefaultNewGemeente("Testgemeente " + new Date().toISOString());

const GemeenteEdit = (props: GemeenteEditProps) => {
    const [selectedTab, setSelectedTab] = useState<string>("tab-algemeen");
    const [centerCoords, setCenterCoords] = React.useState<string | undefined>(undefined);
    const [isEditing, setIsEditing] = useState(!!props.onClose);

    const { gemeente: activecontact, isLoading: isLoading, error: error } = useGemeente(props.id);
    const { users } = useUsers();

    type CurrentState = {
      CompanyName: string|null,
      AlternativeCompanyName: string|null,
      UrlName: string|null,
      ZipID: string|null,
      Helpdesk: string|null,
      DayBeginsAt: Date|null,
      Coordinaten: string|null,
      Zoom: number,
      Bankrekeningnr: string|null,
      PlaatsBank: string|null,
      Tnv: string|null,
      Notes: string|null,
      DateRegistration: Date|null,
    }
  
    const isNew = props.id === "new";

    const [CompanyName, setCompanyName] = useState<string|null>(null);
    const [AlternativeCompanyName, setAlternativeCompanyName] = useState<string|null>(null);
    const [UrlName, setUrlName] = useState<string|null>(null);
    const [ZipID, setZipID] = useState<string|null>(null);
    const [Helpdesk, setHelpdesk] = useState<string|null>(null);
    const [DayBeginsAt, setDayBeginsAt] = useState<Date|null>(null);
    const [Coordinaten, setCoordinaten] = useState<string|null>(null);
    const [Zoom, setZoom] = useState<number>(13);
    const [Bankrekeningnr, setBankrekeningnr] = useState<string|null>(null);
    const [PlaatsBank, setPlaatsBank] = useState<string|null>(null);
    const [Tnv, setTnv] = useState<string|null>(null);
    const [Notes, setNotes] = useState<string|null>(null);
    const [DateRegistration, setDateRegistration] = useState<Date|null>(null);
    const [contactID, setContactID] = useState<string|null>(null);
    const [errorMessage, setErrorMessage] = useState<string|null>(null);
  
    const cDefaultCoordinaten = [52.1326, 5.2913].join(","); // center of NL by default 
  
    const [initialData, setInitialData] = useState<CurrentState>({
      CompanyName: '',
      AlternativeCompanyName: null,
      UrlName: null,
      ZipID: null,
      Helpdesk: null,
      DayBeginsAt: null,
      Coordinaten: cDefaultCoordinaten,
      Zoom: 13,
      Bankrekeningnr: null,
      PlaatsBank: null,
      Tnv: null,
      Notes: null,
      DateRegistration: null,
    });
  
    useEffect(() => {
  
        if (isNew) {
            // Use default values for new record
            const initial = {
                CompanyName: DEFAULTGEMEENTE.CompanyName,
                AlternativeCompanyName: DEFAULTGEMEENTE.AlternativeCompanyName,
                UrlName: DEFAULTGEMEENTE.UrlName,
                ZipID: DEFAULTGEMEENTE.ZipID,
                Helpdesk: DEFAULTGEMEENTE.Helpdesk,
                DayBeginsAt: DEFAULTGEMEENTE.DayBeginsAt,
                Coordinaten: DEFAULTGEMEENTE.Coordinaten,
                Zoom: DEFAULTGEMEENTE.Zoom,
                Bankrekeningnr: DEFAULTGEMEENTE.Bankrekeningnr,
                PlaatsBank: DEFAULTGEMEENTE.PlaatsBank,
                Tnv: DEFAULTGEMEENTE.Tnv,
                Notes: DEFAULTGEMEENTE.Notes,
                DateRegistration: DEFAULTGEMEENTE.DateRegistration,
            };

            setCompanyName(initial.CompanyName);
            setAlternativeCompanyName(initial.AlternativeCompanyName);
            setUrlName(initial.UrlName);
            setZipID(initial.ZipID);
            setHelpdesk(initial.Helpdesk);
            setDayBeginsAt(initial.DayBeginsAt);
            setCoordinaten(initial.Coordinaten);
            setZoom(initial.Zoom);
            setBankrekeningnr(initial.Bankrekeningnr);
            setPlaatsBank(initial.PlaatsBank);
            setTnv(initial.Tnv);
            setNotes(initial.Notes);
            setDateRegistration(initial.DateRegistration);

            setInitialData(initial);
        } else {
            if (activecontact) {
                const initial = {
                    CompanyName: activecontact.CompanyName || initialData.CompanyName,
                    AlternativeCompanyName: activecontact.AlternativeCompanyName || initialData.AlternativeCompanyName,
                    UrlName: activecontact.UrlName || initialData.UrlName,
                    ZipID: activecontact.ZipID || initialData.ZipID,
                    Helpdesk: activecontact.Helpdesk || initialData.Helpdesk,
                    DayBeginsAt: activecontact.DayBeginsAt || initialData.DayBeginsAt,
                    Coordinaten: activecontact.Coordinaten || initialData.Coordinaten,
                    Zoom: activecontact.Zoom || initialData.Zoom,
                    Bankrekeningnr: activecontact.Bankrekeningnr || initialData.Bankrekeningnr,
                    PlaatsBank: activecontact.PlaatsBank || initialData.PlaatsBank,
                    Tnv: activecontact.Tnv || initialData.Tnv,
                    Notes: activecontact.Notes || initialData.Notes,
                    DateRegistration: activecontact.DateRegistration || initialData.DateRegistration,
                };
        
                setCompanyName(initial.CompanyName);
                setAlternativeCompanyName(initial.AlternativeCompanyName);
                setUrlName(initial.UrlName);
                setZipID(initial.ZipID);
                setHelpdesk(initial.Helpdesk);
                setDayBeginsAt(initial.DayBeginsAt);
                setCoordinaten(initial.Coordinaten);
                setZoom(initial.Zoom);
                setBankrekeningnr(initial.Bankrekeningnr);
                setPlaatsBank(initial.PlaatsBank);
                setTnv(initial.Tnv);
                setNotes(initial.Notes);
                setDateRegistration(initial.DateRegistration);
        
                setInitialData(initial);
            }
        }
    }, [props.id, activecontact, isNew]);

    const isDataChanged = () => {
      if (isNew) {
        return !!CompanyName || !!ZipID || !!DayBeginsAt || !!Coordinaten || !!Zoom;
      }

      return (
          CompanyName !== initialData.CompanyName ||
          AlternativeCompanyName !== initialData.AlternativeCompanyName ||
          UrlName !== initialData.UrlName ||
          ZipID !== initialData.ZipID ||
          Helpdesk !== initialData.Helpdesk ||
          DayBeginsAt !== initialData.DayBeginsAt ||
          Coordinaten !== initialData.Coordinaten ||
          Zoom !== initialData.Zoom ||
          Bankrekeningnr !== initialData.Bankrekeningnr ||
          PlaatsBank !== initialData.PlaatsBank ||
          Tnv !== initialData.Tnv ||
          Notes !== initialData.Notes ||
          DateRegistration !== initialData.DateRegistration
      );
    };
    
      const handleUpdate = async () => {
        if (!CompanyName || !ZipID || !DayBeginsAt || !Coordinaten) {
          alert("Organisatie, Postcode ID, Dagstart en Coordinaten mogen niet leeg zijn.");
          return;
        }

        const id = false===isNew ? props.id : 'new';
    
        try {
          const data: Partial<VSContactGemeente> = {
            ID:id,
            ItemType: "organizations",
            CompanyName: CompanyName || '',
            AlternativeCompanyName: AlternativeCompanyName || '',
            UrlName: UrlName || '',
            ZipID: ZipID || '',
            Helpdesk: Helpdesk || '',
            DayBeginsAt: DayBeginsAt,
            Coordinaten: Coordinaten || '',
            Zoom: Zoom,
            Bankrekeningnr: Bankrekeningnr || '',
            PlaatsBank: PlaatsBank || '',
            Tnv: Tnv || '',
            Notes: Notes || '',
            DateRegistration: DateRegistration,
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
          setHelpdesk(null);
          setDayBeginsAt(null);
          setCoordinaten(null);
          setZoom(13);
          setBankrekeningnr(null);
          setPlaatsBank(null);
          setTnv(null);
          setNotes(null);
          setDateRegistration(null);
        } else {
          setCompanyName(initialData.CompanyName);
          setAlternativeCompanyName(initialData.AlternativeCompanyName);
          setUrlName(initialData.UrlName);
          setZipID(initialData.ZipID);
          setHelpdesk(initialData.Helpdesk);
          setDayBeginsAt(initialData.DayBeginsAt);
          setCoordinaten(initialData.Coordinaten);
          setZoom(initialData.Zoom);
          setBankrekeningnr(initialData.Bankrekeningnr);
          setPlaatsBank(initialData.PlaatsBank);
          setTnv(initialData.Tnv);
          setNotes(initialData.Notes);
          setDateRegistration(initialData.DateRegistration);
        }
      };
    
      const updateCoordinatesFromMap = (lat: number, lng: number) => {
        const latlngstring = `${lat},${lng}`;
        if (latlngstring !== Coordinaten) {
          setCoordinaten(latlngstring);
        } else {
          setCoordinaten(null);
        }
        setCenterCoords(undefined);
      }
    
      const updateCoordinatesFromForm = (isLat: boolean) => (e: { target: { value: string; }; }) => {
        try {
          const latlng = initialData.Coordinaten?.split(",")||cDefaultCoordinaten.split(",");
          if (isLat) {
            latlng[0] = e.target.value;
          } else {
            latlng[1] = e.target.value;
          }
          const latlngstring = latlng.join(",");
          if (latlngstring !== Coordinaten) {
            setCoordinaten(latlngstring);
          }
        } catch (e) {
          console.error(e);
        }
      };
    
      const getCoordinate = (isLat: boolean): string => {
        let coords = initialData.Coordinaten;
        if (Coordinaten !== null) {
          coords = Coordinaten;
        }
        if (coords === null || coords === "") return "";
    
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
        const title: string = "Instellingen " + (contact?.CompanyName || "") + (isNew ? " (Nieuw)" : "");
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
                            {props.onClose ? "Annuleer" : "Herstel"}
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

    const userlist: { label: string, value: string | undefined }[] = [
        { label: "Geen", value: undefined },
        ...users
          .filter(user => user.sites.some((site) => site.SiteID === activecontact?.ID))
          .map(user => ({ 
              label: (user.DisplayName || "") + " (" + (user.UserName || "") + ")", 
              value: user.UserID || "" 
          }))
    ];

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
              <Tab label="Logos" value="tab-logos" />
              <Tab label="Coordinaten" value="tab-coordinaten" />
              <Tab label="Gebruikers" value="tab-gebruikers" />
              <Tab label="Externe Gebruikers" value="tab-externe-gebruikers" />
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
                  { users.length > 0 ?
                      <FormSelect 
                        label="Contactpersoon"
                        value={contactID || ''} 
                        onChange={(e) => setContactID(e.target.value || null)} 
                        required
                        options={userlist}
                        disabled={!isEditing}
                      /> 
                      : 
                      <FormInput label="Contactpersoon" value="Voor deze gemeente zijn geen gebruikers geregistreerd" disabled />}
                  <br />
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
                  <FormInput 
                    label="Postcode ID"
                    value={ZipID || ''} 
                    onChange={(e) => setZipID(e.target.value || null)} 
                    required
                    disabled={!isEditing}
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
              </div>
            )}
            {selectedTab === "tab-coordinaten" && (
              <div className="border px-4 py-2">
                <ParkingEditLocation parkingCoords={Coordinaten !== null ? Coordinaten : initialData.Coordinaten} centerCoords={centerCoords} onPan={updateCoordinatesFromMap} initialZoom={8} />
              </div>
            )}
            {selectedTab === "tab-logos" && (
              <div className="border px-4 py-2 space-y-4">
                <SectionBlockEdit heading="Logo">
                { isNew ? (
                    <ContactEditLogo contactdata={DEFAULTGEMEENTE} isLogo2={false} />
                ) : activecontact ? (
                    <ContactEditLogo contactdata={activecontact} isLogo2={false} />
                ) : (
                    <div>
                        <p>Geen contact geselecteerd</p>
                    </div>
                )}
                </SectionBlockEdit>

                <SectionBlockEdit heading="Logo 2 (optioneel)">
                { isNew ? (
                    <ContactEditLogo contactdata={DEFAULTGEMEENTE} isLogo2={true} />
                ) : activecontact ? (
                    <ContactEditLogo contactdata={activecontact} isLogo2={true} />
                ) : (
                    <div>
                        <p>Geen contact geselecteerd</p>
                    </div>
                )}
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