import React, { useState } from "react";

// Import components
import PageTitle from "~/components/PageTitle";
import HorizontalDivider from "~/components/HorizontalDivider";
import { Button } from "~/components/Button";
import FormInput from "~/components/Form/FormInput";
import SectionBlock from "~/components/SectionBlock";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import type { ParkingDetailsType, ParkingStatus } from "~/types/parking";
import {
  getDefaultLocation,
} from "~/utils/parkings";
import {
  cbsCodeFromMunicipality,
  getMunicipalityBasedOnCbsCode,
} from "~/utils/municipality";
import { Tabs, Tab, FormHelperText, Typography } from "@mui/material";

import ParkingEditAbonnementen from "~/components/parking/ParkingEditAbonnementen";
import ParkingEditLocation from "~/components/parking/ParkingEditLocation";
import SectiesManagementNew from "~/components/parking/SectiesManagementNew";
import ParkingEditAfbeelding from "~/components/parking/ParkingEditAfbeelding";
import ParkingEditOpening, {
  type OpeningChangedType,
} from "~/components/parking/ParkingEditOpening";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  type MunicipalityType,
  getMunicipalityBasedOnLatLng,
} from "~/utils/map/active_municipality";
import { geocodeAddress, reverseGeocode, type ReverseGeocodeResult } from "~/utils/nomatim";
import toast from "react-hot-toast";
import { type VSservice } from "~/types/services";
import { useFietsenstallingtypen } from "~/hooks/useFietsenstallingtypen";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import ParkingEditBeheerder from "./ParkingEditBeheerder";
import ParkingEditTarieven from "~/components/parking/ParkingEditTarieven";

export type ParkingEditUpdateStructure = {
  ID?: string;
  Title?: string;
  Status?: ParkingStatus;
  Location?: string;
  Postcode?: string;
  Plaats?: string;
  Coordinaten?: string;
  DateCreated?: Date;
  DateModified?: Date;
  SiteID?: string;
  Beheerder?: string;
  BeheerderContact?: string;
  ExploitantID?: string | null;
  FMS?: boolean;
  StallingsID?: string;

  // [key: string]: string | undefined;
  Openingstijden?: any; // Replace with the actual type if different
  Type?: string;
  Tariefcode?: number | null;
  OmschrijvingTarieven?: string | null;
  ExtraServices?: string | null;
};

type ChangedType = { ID: string; selected: boolean };

const NoClickOverlay = () => {
  const [didClick, setDidClick] = useState(false);

  return (
    <div
      data-name="no-click-overlay"
      className={`
      absolute bottom-0 left-0 right-0 top-0 z-10
      cursor-pointer
      flex-col justify-center
      text-center
      ${didClick ? "hidden" : "flex"}
    `}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.4)",
      }}
      onClick={() => setDidClick(true)}
    >
      <div className="mt-16">Klik om de kaart te bewegen</div>
    </div>
  );
};

interface ParkingEditProps {
  parkingdata: ParkingDetailsType;
  onClose: (closeModal: boolean) => void;
  onChange: () => void;
  showAbonnementen?: boolean;
}

const ParkingEdit = ({
  parkingdata,
  onClose,
  onChange,
  showAbonnementen = false,
}: ParkingEditProps) => {
  // const [selectedTab, setSelectedTab] = React.useState<string>("tab-algemeen");
  const [selectedTab, setSelectedTab] = React.useState<string>("tab-tarieven");
  // const [waarschuwing, setWaarschuwing] = React.useState<string>('');
  // const [allowSave, setAllowSave] = React.useState<boolean>(true);
  const allowSave = true;

  const [newSiteID, setNewSiteID] = React.useState<string | undefined>(
    undefined,
  );
  const [newTitle, setNewTitle] = React.useState<string | undefined>(undefined);
  //
  const [newLocation, setNewLocation] = React.useState<string | undefined>(
    undefined,
  );
  const [newPostcode, setNewPostcode] = React.useState<string | undefined>(
    undefined,
  );
  const [newPlaats, setNewPlaats] = React.useState<string | undefined>(
    undefined,
  );
  const [newCoordinaten, setNewCoordinaten] = React.useState<
    string | undefined
  >(undefined);

  // used for map recenter when coordinates are manually changed
  const [centerCoords, setCenterCoords] = React.useState<string | undefined>(
    undefined,
  );

  // beheerder
  const [newBeheerder, setNewBeheerder] = React.useState<string | undefined>(
    undefined,
  );
  const [newBeheerderContact, setNewBeheerderContact] = React.useState<
    string | undefined
  >(undefined);

  // exploitant selection
  const [newExploitantID, setNewExploitantID] = React.useState<string | undefined>(
    undefined,
  );

  // FMS flag
  const [newFMS, setNewFMS] = React.useState<boolean | undefined>(
    undefined,
  );

  const [newStatus, setNewStatus] = React.useState<ParkingStatus | undefined>(
    undefined,
  );

  // type FietsenstallingSectiesType = { [key: string]: Array[] }

  const [allServices, setAllServices] = React.useState<VSservice[]>([]);
  const [newServices, setNewServices] = React.useState<ChangedType[]>([]);

  const [newOpening, setNewOpening] = React.useState<
    OpeningChangedType | undefined
  >(undefined); // openingstijdenschema
  const [newOpeningstijden, setNewOpeningstijden] = React.useState<
    string | undefined
  >(undefined); // textveld afwijkende openingstijden

  const [newStallingType, setNewStallingType] = React.useState<
    string | undefined
  >(undefined);

  const [newStallingsID, setNewStallingsID] = React.useState<string | undefined>(
    undefined,
  );

  const [newTariefcode, setNewTariefcode] = React.useState<number | null | undefined>(
    undefined,
  );

  const [newOmschrijvingTarieven, setNewOmschrijvingTarieven] = React.useState<
    string | undefined
  >(undefined);

  const [newExtraServices, setNewExtraServices] = React.useState<
    string | undefined
  >(undefined);

  const [currentMunicipality, setCurrentMunicipality] = React.useState<
    MunicipalityType | undefined
  >(undefined);

  const { data: session } = useSession() as { data: Session | null };

  // Check user rights for field-level access control
  const hasFietsenstallingenAdmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
  const hasFietsenstallingenBeperkt = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
  const [hasAbonnementenModule, setHasAbonnementenModule] = React.useState(false);
  const hasFmsservices = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fmsservices);
  const hasFietsberaadSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const canEditAllFields = hasFietsenstallingenAdmin;
  const canEditLimitedFields = hasFietsenstallingenBeperkt || (parkingdata.Status === "aanm");

  // Use the hook for fietsenstallingtypen
  const { fietsenstallingtypen: allTypes, isLoading: fietsenstallingtypenLoading, error: fietsenstallingtypenError } = useFietsenstallingtypen();

  // Set 'allServices' variable in local state
  React.useEffect(() => {
    const updateServices = async () => {
      const response = await fetch(`/api/protected/services`);
      const json = await response.json() as VSservice[];
      if (!json) return [];

      setAllServices(json);
    }

    updateServices().catch(err => {
      console.error("get all services error", err);
    });
  }, []);

  React.useEffect(() => {
    updateSiteID();
  }, [parkingdata.Location, newCoordinaten]);

  const siteIdForModules = parkingdata.SiteID || session?.user?.activeContactId || "";

  React.useEffect(() => {
    let cancelled = false;

    const fetchModules = async () => {
      if (!siteIdForModules) {
        setHasAbonnementenModule(false);
        return;
      }

      if (siteIdForModules === "1") {
        setHasAbonnementenModule(true);
        return;
      }

      try {
        const response = await fetch(`/api/protected/modules_contacts?contactId=${siteIdForModules}`);
        if (!response.ok) {
          throw new Error("Failed to fetch modules");
        }
        const modules = await response.json();
        if (!cancelled) {
          const hasModule = Array.isArray(modules) && modules.some((module: { ModuleID?: string }) => module.ModuleID === "abonnementen");
          setHasAbonnementenModule(hasModule);
        }
      } catch (error) {
        console.error("Error fetching modules for contact:", error);
        if (!cancelled) {
          setHasAbonnementenModule(false);
        }
      }
    };

    fetchModules();

    return () => {
      cancelled = true;
    };
  }, [siteIdForModules]);

  const showAbonnementenTab = (showAbonnementen || hasAbonnementenModule) && parkingdata.ID !== "" && session !== null;
  const showTarievenTab = (canEditAllFields || canEditLimitedFields) && parkingdata.ID !== "" && session !== null;


  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    setSelectedTab(newValue);
  };

  type checkInfo = {
    type: "string" | "coordinaten";
    text: string;
    value: any;
    newvalue: any;
  };

  const updateSiteID = () => {
    const currentll =
      undefined !== newCoordinaten ? newCoordinaten : parkingdata.Coordinaten;
    if (!currentll) return;
    getMunicipalityBasedOnLatLng(currentll.split(","))
      .then(async result => {
        if (result !== false) {
          // Set municipality in state
          setCurrentMunicipality(result);

          // Find CBS code of this municipality
          const cbsCode = cbsCodeFromMunicipality(result);
          // Reset newSiteID if no cbsCode was found
          if (!cbsCode) {
            setNewSiteID(undefined);
            return;
          }

          // Find municipality row in database based on cbsCode
          const municipality = await getMunicipalityBasedOnCbsCode(cbsCode);
          // Reset newSiteID if no municipality row was found
          if (!municipality) {
            setNewSiteID(undefined);
            return;
          }

          if (municipality.ID !== parkingdata.SiteID) {
            setNewSiteID(municipality.ID);
          } else {
            setNewSiteID(undefined);
          }
        } else {
          setCurrentMunicipality(undefined);
          setNewSiteID(undefined);
        }
      })
      .catch(err => {
        console.error("municipality based on latlng error", err);
      });
  };

  const validateParkingData = (): boolean => {
    const checkStringType = (check: checkInfo): string => {
      if (
        (check.value === "" || check.value === null) &&
        check.newvalue === undefined
      ) {
        return `invoer van ${check.text} is verplicht`;
      } else {
        return "";
      }
    };

    const checkCoordinatenType = (check: checkInfo): string => {
      if (check.value === getDefaultLocation && check.newvalue === undefined) {
        return `${check.text} is verplicht`;
      } else {
        return "";
      }
    };

    const checks: checkInfo[] = [
      {
        type: "string",
        text: "invoer van de naam van de stalling",
        value: parkingdata.Title,
        newvalue: newTitle,
      },
      {
        type: "string",
        text: "selectie van de gemeente",
        value: parkingdata.SiteID,
        newvalue: newSiteID,
      },
      {
        type: "coordinaten",
        text: "instellen van de locatie op de kaart",
        value: parkingdata.Coordinaten,
        newvalue: newCoordinaten,
      },
    ];
    // parkingdata.Locatie is optional
    // parkingdata.Plaats is optional
    // parkingdata.Postcode is optional

    // Only validate beheerder fields if user has admin rights
    // TODO: there are too many existing records with null exploitantID, so we don't validate this now, maybe in the future
    // if (canEditAllFields) {
    //   if (parkingdata.ExploitantID !== null) {
    //     checks.push({
    //       type: "string",
    //       text: "invoer van de contactgegevens van de beheerder",
    //       value: parkingdata.Beheerder,
    //       newvalue: newBeheerder,
    //     });
    //   }
    //   checks.push({
    //     type: "string",
    //     text: "invoer van de contactgegevens van de beheerder",
    //     value: parkingdata.BeheerderContact,
    //     newvalue: newBeheerderContact,
    //   });
    // }

    // Not checked / check not required
    // Type, Image, Openingstijden, Capacity, FMS, Beheerder, BeheerderContact, fietsenstalling_type, fietsenstalling_secties, abonnementsvorm_fietsenstalling, exploitant, fietsenstallingen_services

    let message = "";
    for (const check of checks) {
      switch (check.type) {
        case "string":
          message = checkStringType(check);
          break;
        case "coordinaten":
          message = checkCoordinatenType(check);
          break;
        default:
          break;
      }

      if (message !== "") {
        alert(message);
        return false;
      }
    }

    return true;
  };

  const getUpdate = () => {
    const update: ParkingEditUpdateStructure = {};

    update.ID = parkingdata.ID;

    if (newTitle !== undefined) {
      update.Title = newTitle;
    }
    if (newLocation !== undefined) {
      update.Location = newLocation;
    }
    if (newPostcode !== undefined) {
      update.Postcode = newPostcode;
    }
    if (newPlaats !== undefined) {
      update.Plaats = newPlaats;
    }
    if (newCoordinaten !== undefined) {
      update.Coordinaten = newCoordinaten;
    }
    if (newSiteID !== undefined) {
      update.SiteID = newSiteID;
    }

    if (newBeheerder !== undefined) {
      update.Beheerder = newBeheerder;
    }
    if (newBeheerderContact !== undefined) {
      update.BeheerderContact = newBeheerderContact;
    }

    if (newExploitantID !== undefined) {
      update.ExploitantID = newExploitantID === 'anders' ? null : newExploitantID;
    }

    if (newFMS !== undefined) {
      update.FMS = newFMS;
    }

    if (newStallingsID !== undefined) {
      update.StallingsID = newStallingsID;
    }

    if (newStallingType !== undefined) {
      update.Type = newStallingType;
    }

    if (newStatus !== undefined) {
      update.Status = newStatus;
    }

    if (undefined !== newOpening) {
      for (const keystr in newOpening) {
        const key = keystr as keyof ParkingEditUpdateStructure;
        if (newOpening[key] === null) {
          update[key] = null;
        } else if (newOpening[key] !== undefined) {
          update[key] = newOpening[key].format("YYYY-MM-DDTHH:mm:ss.SSS[Z]");
        } else {
          // do nothing
        }
      }
    }


    if (undefined !== newOpeningstijden) {
      if (newOpeningstijden !== parkingdata.Openingstijden) {
        update.Openingstijden = newOpeningstijden;
      }
    }

    // Add Tariefcode handling (only include if explicitly changed)
    if (newTariefcode !== undefined) {
      // Convert 0 to null for consistency (both represent "niet tonen")
      update.Tariefcode = (newTariefcode === 0 || newTariefcode === null) ? null : newTariefcode;
    }

    if (newOmschrijvingTarieven !== undefined) {
      if (newOmschrijvingTarieven !== parkingdata.OmschrijvingTarieven) {
        update.OmschrijvingTarieven = newOmschrijvingTarieven;
      }
    }

    if (newExtraServices !== undefined) {
      if (newExtraServices !== parkingdata.ExtraServices) {
        update.ExtraServices = newExtraServices;
      }
    }

    // Set DateCreated and DateModified
    const today = new Date();
    if (!parkingdata.DateCreated) {
      update.DateCreated = today;
    }

    update.DateModified = today;

    // update.fietsenstalling_secties = [];

    return update;
  };

  const updateServices = async (
    parkingdata: ParkingDetailsType,
    newServices: ChangedType[],
  ) => {
    try {
      // Delete existing services for this parking
      await fetch(
        "/api/fietsenstallingen_services/deleteForParking?fietsenstallingId=" +
          parkingdata.ID,
        { method: "DELETE" },
      );
      // Create servicesToSave object
      const servicesToSave: {}[] = [];
      // - First, add existing services
      parkingdata.fietsenstallingen_services &&
        parkingdata.fietsenstallingen_services.forEach(x => {
          // To be removed?
          const doRemove = newServices
            .filter(s => s.ID === x.services.ID && !s.selected)
            .pop();
          if (!doRemove) {
            servicesToSave.push({
              ServiceID: x.services.ID,
              FietsenstallingID: parkingdata.ID,
            });
          }
        });
      // - Second, add new services
      newServices.forEach(s => {
        // Don't add if service is not selected
        if (!s.selected) return;

        servicesToSave.push({
          ServiceID: s.ID,
          FietsenstallingID: parkingdata.ID,
        });
      });
      // Create parking services in database
      await fetch("/api/fietsenstallingen_services/create", {
        method: "POST",
        body: JSON.stringify(servicesToSave),
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      console.error(err);
    }
  };


  const parkingChanged = (update: ParkingEditUpdateStructure) => {
    try {
      const isChanged =
        Object.keys(update).length !== 0 ||
        newServices.length > 0 ||
        newOpening !== undefined ||
        newOpeningstijden !== undefined;

      return isChanged;
    } catch (ex) {
      console.error(
        "ParkingEdit - unable to determine if parking data has changed",
      );
      return false;
    }
  };

  const handleRemoveParking = async (
    message = "",
  ): Promise<boolean> => {
    try {
      if (parkingdata.Status !== "aanm" && parkingdata.Status !== "new") {
        // Update logic for derived tables is not fully implemented!
        throw Error(
          "Het is niet toegestaan om een goedgekeurde stalling te verwijderen. Gebruik de knop verbergen om deze onzichtbaar te maken.",
        );
      }

      if (message !== "") {
        if (!confirm(message)) return false;
      }

      const result1 = await fetch(
        "/api/fietsenstallingen_services/deleteForParking?fietsenstallingId=" +
          parkingdata.ID,
        { method: "DELETE" },
      );

      const result2 = await fetch(
        `/api/protected/fietsenstallingen/${parkingdata.ID}`,
        { method: "DELETE" },
      );

      if (false === result1.ok || false === result2.ok) {
        toast("De stalling kon niet worden verwijderd.");
      } else {
        toast("De stalling is verwijderd.");
      }

      onChange();
      onClose(true);

      return true;
    } catch (ex) {
      console.error("ParkingEdit - unable to remove parking record");
      return false;
    }
  };

  const handleUpdateParking = async () => {
    try {
      if (!parkingdata) return;

      if (!validateParkingData()) {
        console.warn("ParkingEdit - invalid data: update cancelled");
        return;
      }

      // Check if parking was changed
      const update = getUpdate();

      if (parkingdata.Status === "aanm") {
        const canChangeStatus = hasFietsenstallingenAdmin || hasFietsenstallingenBeperkt;
        if(canChangeStatus) {
          update.Status = "1";  
        } else {
          // keep status as aanm
        }
      } else if (parkingdata.Status === "new") {
        update.Status = "1";
      }

      if (false === parkingChanged(update)) {
        onChange();
        onClose(session === null);
        return;
      }

      const result = await fetch(
        `/api/protected/fietsenstallingen/${parkingdata.ID}`,
        {
          method: "PUT",
          body: JSON.stringify(update),
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      if (!result.ok) {
        throw Error(
          "Er ging iets fout bij het opslaan. Controleer of de gegevens kloppen. Is de postcode bijvoorbeeld juist, en niet te lang?",
        );
      }

      // If services are updated: Update services
      if (newServices.length > 0) {
        await updateServices(parkingdata, newServices);
      }

      if (session === null) {
        toast(
          `Uw voorstel wordt aangemeld bij gemeente ${currentMunicipality?.name}.`,
          { duration: 15000, style: { minWidth: "40vw" } },
        );
      } else {
        toast(`De stallingsgegevens zijn opgeslagen`);
      }

      onChange();
      onClose(session === null);
    } catch (err: any) {
      if (err.message) alert(err.message);
      else alert(err);
    }
  };

  const update: ParkingEditUpdateStructure = getUpdate();
  const isVoorstel = parkingdata?.Status === "aanm";
  const showUpdateButtons = isVoorstel || parkingChanged(update);

  const updateCoordinatesFromMap = (lat: number, lng: number) => {
    const latlngstring = `${lat},${lng}`;
    if (latlngstring !== parkingdata.Coordinaten) {
      setNewCoordinaten(latlngstring);
    } else {
      setNewCoordinaten(undefined);
    }
    setCenterCoords(undefined);
  };

  const updateCoordinatesFromForm =
    (isLat: boolean) => (e: { target: { value: string } }) => {
      try {
        const latlng = parkingdata.Coordinaten!==null ? parkingdata.Coordinaten.split(",") : [];
        if (isLat) {
          latlng[0] = e.target.value;
        } else {
          latlng[1] = e.target.value;
        }
        setNewCoordinaten(latlng.join(","));
        setCenterCoords(latlng.join(","));
      } catch (ex: any) {
        if (ex.message) {
          console.warn(
            "ParkingEditLocation - unable to set coordinates from form: ",
            ex.message(),
          );
        } else {
          console.warn(
            "ParkingEditLocation - unable to set coordinates from form",
          );
        }
      }
    };

  const getCoordinate = (isLat: boolean): string => {
    let coords = parkingdata.Coordinaten;
    if (newCoordinaten !== undefined) {
      coords = newCoordinaten;
    }
    if (coords === "" || coords === null) return "";

    const latlng = coords.split(",");
    if (isLat) {
      return latlng[0]?.toString() || "";
    } else {
      return latlng[1]?.toString() || "";
    }
  };

  const renderTabAlgemeen = (visible = false) => {
    const serviceIsActive = (ID: string): boolean => {
      const change = newServices.find(s => s.ID === ID);
      if (change !== undefined) {
        return change.selected;
      }

      if (undefined === parkingdata.fietsenstallingen_services) {
        return false;
      }

      for (const item of parkingdata.fietsenstallingen_services) {
        if (item.services.ID === ID) {
          return true;
        }
      }

      return false;
    };

    const handleSelectService = (ID: string, checked: boolean) => {
      const index = newServices.findIndex(s => s.ID === ID);
      if (index !== -1) {
        newServices.splice(index, 1);
      } else {
        newServices.push({ ID: ID, selected: checked });
      }

      setNewServices([...newServices]);
    };

    const addressValid = () => {
      return (
        ((parkingdata.Location !== "" || newLocation !== undefined) &&
          (parkingdata.Plaats !== "" || newPlaats !== undefined)) ||
        parkingdata.Postcode !== "" ||
        newPostcode !== undefined
      );
    };

    const handleAddressLookup = async () => {
      const latlng = await geocodeAddress(
        newLocation !== undefined ? newLocation : parkingdata.Location || "", 
        newPostcode !== undefined ? newPostcode : parkingdata.Postcode || "",
        newPlaats !== undefined ? newPlaats : parkingdata.Plaats || "",
      );
      if (false !== latlng) {
        setNewCoordinaten(latlng.lat + "," + latlng.lon);
        setCenterCoords(latlng.lat + "," + latlng.lon);
      } else {
        alert(
          "Er is geen locatie beschikbaar voor dit adres. U kunt de locatie handmatig aanpassen.",
        );
      }
    };

    const handleCoordinatesLookup = async () => {
      let address: ReverseGeocodeResult | false = false;
      const theCoords = newCoordinaten !== undefined ? newCoordinaten : parkingdata.Coordinaten;
      if(theCoords !== undefined && theCoords !== null) {
          console.log("** REVERSE GEOCODING", theCoords);
         address = await reverseGeocode(theCoords);
      } 

      if (address && address.address) {
        const location = (
          (address.address.road || "---") +
          " " +
          (address.address.house_number || "")
        ).trim();
        setNewLocation(location);
        setNewPostcode(address.address.postcode);
        const plaats =
          address.address.city ||
          address.address.town ||
          address.address.village ||
          address.address.quarter;
        setNewPlaats(plaats);

        if (
          (parkingdata.Title === "" &&
            (newTitle === "" || newTitle === undefined)) ||
          (newTitle && newTitle.startsWith("Nieuwe stalling")) ||
          (!newTitle && (parkingdata.Title||"").startsWith("Nieuwe stalling"))
        ) {
          setNewTitle("Nieuwe stalling " + (location + " " + plaats).trim());
        }
      } else {
        alert(
          "Er is geen locatie beschikbaar voor dit adres. U kunt de locatie handmatig aanpassen.",
        );
      }
    };

    const toValidParkingStatus = (status: string): ParkingStatus | undefined => {
      if(status === "new" || status === "aanm" || status === "1" || status === "0" || status === "x") {
        // console.log("** TO VALID PARKING STATUS RETURN", status);
        return status as ParkingStatus;
      }

      // console.log("** TO VALID PARKING STATUS RETURN 0", status);
      console.warn(`Invalid parking status for parking ${parkingdata.ID}/${parkingdata.Title}: ${status}, setting to 0`);
      return "0";
    }

    const renderStatusSection = () => {
      if(parkingdata.Status==="aanm") {
        return (
          <SectionBlock heading="Status">
            <label>Nieuw voorstel</label>
          </SectionBlock>
        )
      } else if (parkingdata.Status==="1" || parkingdata.Status==="0") {
        let statusTypes = [
          { id: "0", name: "Verborgen" },
          { id: "1", name: "Actief" },
        ];
    
        return (
          <SectionBlock heading="Status">
          <select value={newStatus !== undefined ? newStatus : parkingdata.Status || "new"} onChange={(e) => { 
            setNewStatus(toValidParkingStatus(e.target.value || "new")) 
            }}>
            {statusTypes.map(type => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          </SectionBlock>
          );
      } else {
        let statusTypes = [
          { id: "new", name: "Nieuw voorstel" },
          { id: "aanm", name: "Aanmeld voorstel" },
          { id: "1", name: "Actief" },
          { id: "0", name: "Verborgen" },
          { id: "x", name: "Systeemstalling" },
        ];

        return (
          <SectionBlock heading="Status">
          <label>
            {statusTypes.find(t => t.id === parkingdata.Status)?.name}
          </label>
        </SectionBlock>
        );
      }
    }

    return (
      <div
        className="flex justify-between"
        style={{ display: visible ? "flex" : "none" }}
      >
        <div data-name="content-left" className="sm:mr-12">
          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <FormInput
                key="i-title"
                label="Naam stalling"
                className="mb-1 w-full border-2 border-black"
                placeholder="Naam van de stalling"
                onChange={e => {
                  setNewTitle(e.target.value);
                }}
                value={newTitle !== undefined ? newTitle : parkingdata.Title}
                disabled={!canEditAllFields && !canEditLimitedFields}
              />
              <br />
              <FormInput
                key="i-stallingsid"
                label="StallingsID"
                className="mb-1 w-full border-2 border-black"
                placeholder="StallingsID"
                onChange={e => {
                  setNewStallingsID(e.target.value);
                }}
                value={newStallingsID !== undefined ? newStallingsID : parkingdata.StallingsID || ""}
                disabled={!hasFietsberaadSuperadmin}
              />
              <br />
              <FormInput
                key="i-location"
                label="Straat en huisnummer"
                className="mb-1 w-full border-2 border-black"
                placeholder="adres"
                onChange={e => {
                  setNewLocation(e.target.value);
                }}
                value={
                  newLocation !== undefined ? newLocation : parkingdata.Location
                }
                disabled={!canEditAllFields && !canEditLimitedFields}
              />
              <br />
              <>
                <FormInput
                  key="i-postcode"
                  label="Postcode"
                  className="mb-1 w-full border-2 border-black"
                  placeholder="postcode"
                  onChange={e => {
                    setNewPostcode(e.target.value);
                  }}
                  value={
                    newPostcode !== undefined
                      ? newPostcode
                      : parkingdata.Postcode
                  }
                  disabled={!canEditAllFields && !canEditLimitedFields}
                />
                <FormInput
                  key="i-plaats"
                  label="Plaats"
                  className="mb-1 w-full border-2 border-black"
                  placeholder="plaats"
                  onChange={e => {
                    setNewPlaats(e.target.value);
                  }}
                  value={
                    newPlaats !== undefined ? newPlaats : parkingdata.Plaats
                  }
                  disabled={!canEditAllFields && !canEditLimitedFields}
                />
                {addressValid() && (canEditAllFields || canEditLimitedFields) && (
                  <Button 
                    className="mr-4 mt-4" 
                    onClick={handleAddressLookup}
                  >
                    Toon op kaart
                  </Button>
                )}
              </>
              <br />
            </div>
          </SectionBlockEdit>

          <HorizontalDivider className="my-4" />

          <SectionBlock heading="Services">
            <div className="flex-1">
              <div>
                {allServices &&
                  allServices.map(service => (
                    <div key={service.ID}>
                      <label className={`block py-1 ${(canEditAllFields || canEditLimitedFields) ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-50'}`}>
                        <input
                          type="checkbox"
                          className="mr-2 inline-block"
                          checked={serviceIsActive(service.ID)}
                          onChange={e =>
                            handleSelectService(service.ID, e.target.checked)
                          }
                          disabled={!canEditAllFields && !canEditLimitedFields}
                        />
                        {service.Name}
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          </SectionBlock>

          <HorizontalDivider className="my-4" />

          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <FormInput
                key="i-extraservices"
                label="Extra services (komma gescheiden)"
                className="mb-1 w-full border-2 border-black"
                placeholder="extra services"
                onChange={e => {
                  setNewExtraServices(e.target.value);
                }}
                value={newExtraServices !== undefined ? newExtraServices : (parkingdata.ExtraServices || "")}
                disabled={!canEditAllFields && !canEditLimitedFields}
              />
            </div>
          </SectionBlockEdit>

          <HorizontalDivider className="my-4" />

          <SectionBlock heading="Soort stalling">
            {fietsenstallingtypenLoading ? (
              <div>Laden...</div>
            ) : fietsenstallingtypenError ? (
              <div className="text-red-500">Fout bij laden: {fietsenstallingtypenError}</div>
            ) : (
              <select
                value={
                  newStallingType !== undefined
                    ? newStallingType
                    : parkingdata.Type || "bewaakt"
                }
                onChange={event => {
                  setNewStallingType(event.target.value);
                }}
                disabled={!(canEditAllFields || isVoorstel)}
                className={!(canEditAllFields || isVoorstel) ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {allTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            )}
          </SectionBlock>

          <HorizontalDivider className="my-4" />

          {!isVoorstel && <SectionBlock heading="FMS">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="fms-checkbox"
                className={`mr-2 h-4 w-4 ${!canEditAllFields ? 'opacity-50 cursor-not-allowed' : ''}`}
                checked={newFMS !== undefined ? newFMS : parkingdata.FMS || false}
                onChange={e => {
                  if(e.target.checked === false) {
                    if(confirm("Weet u zeker dat u deze instelling wilt uitzetten? Dit heeft invloed op de weergave in sommige rapportages.")!==true) {
                      return
                    }
                  }
                  
                  console.debug("#### setting FMS to", e.target.checked);
                  setNewFMS(e.target.checked);
                }}
                disabled={!hasFmsservices}
              />
              <label htmlFor="fms-checkbox" className={`text-sm font-medium ${!canEditAllFields ? 'text-gray-500' : 'text-gray-700'}`}>
                Stalling communiceert met FMS-webserver
              </label>
            </div>
          </SectionBlock> }

          {!isVoorstel && <HorizontalDivider className="my-4" /> }

          { renderStatusSection() } 

          <p className="mb-10">{/*Some spacing*/}</p>

          {/*<button>Breng mij hier naartoe</button>*/}
        </div>

        <div
          data-name="content-right"
          className="relative ml-12 hidden sm:block"
        >
          <div className="relative">
            <NoClickOverlay />
            <ParkingEditLocation
              parkingCoords={
                newCoordinaten !== undefined
                  ? newCoordinaten
                  : parkingdata.Coordinaten
              }
              centerCoords={centerCoords}
              onPan={updateCoordinatesFromMap}
            />
          </div>
          <FormHelperText className="w-full pb-2">
            <Typography className="py-2 text-center" variant="h6">
              Verschuif de kaart om de coordinaten aan te passen
            </Typography>
          </FormHelperText>
          <FormInput
            key="i-lat"
            label="Latitude"
            type="number"
            className="w-full border-2 border-black pt-2"
            placeholder="latitude"
            onChange={updateCoordinatesFromForm(true)}
            value={getCoordinate(true)}
            disabled={!canEditAllFields && !canEditLimitedFields}
          />
          <FormInput
            key="i-lng"
            label="Longitude"
            type="number"
            className="w-full border-2 border-black pt-2"
            placeholder="longitude"
            onChange={updateCoordinatesFromForm(false)}
            value={getCoordinate(false)}
            disabled={!canEditAllFields && !canEditLimitedFields}
          />
          {(newCoordinaten || !addressValid()) && (canEditAllFields || canEditLimitedFields) && (
            <Button className="mt-4" onClick={handleCoordinatesLookup}>
              Adres opzoeken
            </Button>
          )}

          {
            <FormInput
              key="i-gemeente"
              label="Gemeente"
              type="text"
              className="w-full border-2 border-black pt-2"
              placeholder=""
              value={currentMunicipality ? currentMunicipality.name : ""}
              disabled={true}
            />
          }
        </div>
      </div>
    );
  };

  const renderTabAfbeelding = (visible = false) => {
    return (
      <div
        className="- mt-10 flex h-full w-full justify-between"
        style={{ display: visible ? "flex" : "none" }}
      >
        <ParkingEditAfbeelding
          parkingdata={parkingdata}
          onUpdateAfbeelding={onChange}
        />
      </div>
    );
  };

  const renderTabOpeningstijden = (visible = false) => {
    const handlerSetNewOpening = (
      tijden: OpeningChangedType,
      Openingstijden: string,
    ): void => {
      // console.log("set new opening", tijden, Openingstijden);
      setNewOpening(tijden);
      setNewOpeningstijden(Openingstijden);
      return;
    };
    return (
      <div
        className="mt-10 flex w-full justify-between"
        style={{ display: visible ? "flex" : "none" }}
      >
        <ParkingEditOpening
          parkingdata={parkingdata}
          openingChanged={handlerSetNewOpening}
          canEditAllFields={canEditAllFields}
          canEditLimitedFields={canEditLimitedFields}
          isVoorstel={isVoorstel}
        />
      </div>
    );
  };

  const renderTabTarieven = (visible = false) => {
    if(!visible) {
      return null;
    }

    return (
      <div
        className="mt-10 flex flex-col w-full"
        style={{ display: visible ? "flex" : "none" }}
      >
        <ParkingEditTarieven
          parkingdata={parkingdata}
          newTariefcode={newTariefcode}
          setNewTariefcode={setNewTariefcode}
          newOmschrijvingTarieven={newOmschrijvingTarieven}
          setNewOmschrijvingTarieven={setNewOmschrijvingTarieven}
          canEdit={canEditAllFields||canEditLimitedFields}
        />
      </div>
    );
  };

  const renderTabCapaciteit = (visible = false) => {
    return (
      <div
        className="mt-10 flex w-full justify-between"
        style={{ display: visible ? "flex" : "none" }}
      >
        <SectiesManagementNew
          fietsenstallingId={parkingdata.ID}
          fietsenstallingType={parkingdata.Type}
        />
      </div>
    );
  };

  const renderTabAbonnementen = (visible = false) => {
    return (
      <div
        className="mt-10 flex w-full flex-col"
        style={{ display: visible ? "flex" : "none" }}
      >
        <ParkingEditAbonnementen
          parkingId={parkingdata.ID}
          parkingType={parkingdata.Type}
          canEdit={canEditAllFields || hasFietsenstallingenBeperkt}
        />
      </div>
    );
  };

  const renderTabBeheerder = (visible = false) => {
    return (
      <ParkingEditBeheerder
        visible={visible}
        newExploitantID={newExploitantID}
        setNewExploitantID={setNewExploitantID}
        parkingdata={parkingdata}
        canEditAllFields={canEditAllFields}
        newBeheerder={newBeheerder}
        setNewBeheerder={setNewBeheerder}
        newBeheerderContact={newBeheerderContact}
        setNewBeheerderContact={setNewBeheerderContact}
      />
    );
  };

  let parkingTitle = parkingdata.Title;
  if (parkingdata.ID.substring(0, 8) === "VOORSTEL") {
    parkingTitle += " (voorstel)";
  }

  const isLoggedIn = session !== null;
  const hasID = parkingdata.ID !== "";

  let opslaanTekst = "";
  if(isVoorstel) {
    opslaanTekst = isLoggedIn? "Accepteer voorstel" : "Aanmelden";
  } else {
    opslaanTekst = "Opslaan"
  } 

  return (
    <div className="" style={{ minHeight: "65vh" }}>
      <div
        className="
          flex justify-between
          sm:mr-8
        "
      >
        <PageTitle className="flex w-full justify-center sm:justify-start">
          <div className="mr-4 hidden sm:block">
            {parkingTitle || newTitle || "Nieuwe Stalling"}
          </div>
          {showUpdateButtons === true && allowSave && (
            <Button
              key="b-1"
              className="mt-3 sm:mt-0"
              onClick={(e: any) => {
                if (e) e.preventDefault();
                handleUpdateParking();
              }}
            >
              { opslaanTekst }
            </Button>
          )}
          {isVoorstel && isLoggedIn && (
            <Button
              key="b-2"
              className="ml-6 mt-3 sm:mt-0"
              onClick={(e: any) => {
                if (e) e.preventDefault();
                handleRemoveParking(
                  "Weet u zeker dat u deze stalling wilt verwijderen? Dit kan niet ongedaan worden gemaakt!",
                );
              }}
            >
              Verwijder
            </Button>
          )}
          {showUpdateButtons === true && (
            <Button
              key="b-3"
              className="ml-2 mt-3 sm:mt-0"
              variant="secundary"
              onClick={(e: MouseEvent) => {
                if (e) e.preventDefault();

                if (parkingdata?.Status === "aanm") {
                  handleRemoveParking(
                    "Weet u zeker dat u de invoer wilt afbreken? De ingevoerde gegevens worden niet opgeslagen.",
                  );
                } else {
                  if (confirm("Wil je het bewerkformulier verlaten?")) {
                    onClose(false);
                  }
                }
              }}
            >
              Annuleer
            </Button>
          )}
          {showUpdateButtons === false && (
            <Button
              key="b-4"
              className="ml-2 mt-3 sm:mt-0"
              onClick={(e: any) => {
                if (e) e.preventDefault();
                onClose(false);
              }}
            >
              Terug
            </Button>
          )}
        </PageTitle>
      </div>

      <Tabs
        value={selectedTab}
        onChange={handleChange}
        aria-label="Edit parking"
      >
        <Tab label="Algemeen" value="tab-algemeen" />
        {hasID && <Tab label="Afbeelding" value="tab-afbeelding" />}
        {hasID && isLoggedIn && (
          <Tab label="Capaciteit" value="tab-capaciteit" />
        )}
        <Tab label="Openingstijden" value="tab-openingstijden" />
        {showTarievenTab && (
          <Tab label="Tarieven" value="tab-tarieven" />
        )}
        {showAbonnementenTab && (
          <Tab label="Abonnementen" value="tab-abonnementen" />
        )}
        {isLoggedIn && <Tab label="Beheerder" value="tab-beheerder" />}
      </Tabs>

      {renderTabAlgemeen(selectedTab === "tab-algemeen")}
      {renderTabAfbeelding(selectedTab === "tab-afbeelding" && hasID)}
      {renderTabCapaciteit(
        selectedTab === "tab-capaciteit" && hasID && isLoggedIn,
      )}
      {renderTabOpeningstijden(selectedTab === "tab-openingstijden")}
      {renderTabTarieven(
        showTarievenTab && selectedTab === "tab-tarieven"
      )}
      {renderTabAbonnementen(
        showAbonnementenTab && selectedTab === "tab-abonnementen",
      )}
      {renderTabBeheerder(selectedTab === "tab-beheerder" && isLoggedIn)}
    </div>
  );
};

export default ParkingEdit;
