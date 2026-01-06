import React, { useEffect, useState } from "react";
import FormInput from "~/components/Form/FormInput";
import PageTitle from "~/components/PageTitle";
import Button from "@mui/material/Button";

import { type VSContactDataprovider, VSContactItemType } from "~/types/contacts";
import type { DataproviderValidateResponse } from "~/pages/api/protected/dataprovider/validate";
import { getDefaultNewDataprovider } from "~/types/database";
import { useDataprovider } from "~/hooks/useDataprovider";
import { makeClientApiCall } from "~/utils/client/api-tools";
import { type DataproviderResponse } from "~/pages/api/protected/dataprovider/[id]";
import FormSelect from "../Form/FormSelect";

type DataproviderEditProps = {
  id: string;
  onClose?: (confirmClose: boolean) => void;
};

const DEFAULT_DATAPROVIDER: VSContactDataprovider = getDefaultNewDataprovider(
  "Testdataprovider " + new Date().toISOString(),
);

const DataproviderEdit = (props: DataproviderEditProps) => {
  const [isEditing, setIsEditing] = useState(!!props.onClose);

  const {
    dataprovider: activecontact,
    isLoading: isLoading,
    error: error,
  } = useDataprovider(props.id);

  type CurrentState = {
    CompanyName: string | null;
    UrlName: string | null;
    Password: string | null;
    Status: string | null;
  };

  const isNew = props.id === "new";

  const [CompanyName, setCompanyName] = useState<string | null>(null);
  const [UrlName, setUrlName] = useState<string | null>(null);
  const [Status, setStatus] = useState<string | null>(null);
  const [Password, setPassword] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [initialData, setInitialData] = useState<CurrentState>({
    CompanyName: "",
    UrlName: null,
    Password: null,
    Status: null,
  });

  useEffect(() => {
    if (isNew) {
      const initial = {
        CompanyName: DEFAULT_DATAPROVIDER.CompanyName,
        UrlName: DEFAULT_DATAPROVIDER.UrlName,
        Password: DEFAULT_DATAPROVIDER.Password,
        Status: DEFAULT_DATAPROVIDER.Status,
      };

      setCompanyName(initial.CompanyName);
      setUrlName(initial.UrlName);
      setPassword(initial.Password);
      setStatus(initial.Status);

      setInitialData(initial);
    } else {
      if (activecontact) {
        const initial = {
          CompanyName: activecontact.CompanyName || initialData.CompanyName,
          UrlName: activecontact.UrlName || initialData.UrlName,
          Password: activecontact.Password || initialData.Password,
          Status: activecontact.Status || initialData.Status,
        };

        setCompanyName(initial.CompanyName);
        setUrlName(initial.UrlName);
        setPassword(initial.Password);
        setStatus(initial.Status);

        setInitialData(initial);
      }
    }
  }, [props.id, activecontact, isNew]);

  const isDataChanged = () => {
    if (isNew) {
      return !!CompanyName || !!UrlName || !!Password || !!Status;
    }
    return (
      CompanyName !== initialData.CompanyName ||
      UrlName !== initialData.UrlName ||
      Password !== initialData.Password ||
      Status !== initialData.Status
    );
  };

  const handleUpdate = async () => {
    console.log(`handleUpdate ${CompanyName} / ${UrlName} / ${Password} ${Status}`);
    if (!CompanyName || !UrlName || !Password || !Status) {
      setErrorMessage("Naam, ContractorID, Wachtwoord en Status zijn verplichte velden");
      return;
    }

    const id = false === isNew ? props.id : "new";

    try {
      const data: Partial<VSContactDataprovider> = {
        ID: id,
        ItemType: VSContactItemType.Dataprovider,
        CompanyName,
        UrlName,
        Password,
        Status,
      };

      const urlValidate = `/api/protected/dataprovider/validate/`;
      const responseValidate =
        await makeClientApiCall<DataproviderValidateResponse>(
          urlValidate,
          "POST",
          data,
        );
      if (!responseValidate.success) {
        setErrorMessage(
          `Kan dataproviderdata niet valideren: (${responseValidate.error})`,
        );
        return;
      }

      if (!responseValidate.result.valid) {
        console.log("responseValidate.result.message", responseValidate.result.message);
        setErrorMessage(responseValidate.result.message);
        return;
      }

      const method = isNew ? "POST" : "PUT";
      const url = `/api/protected/dataprovider/${id}`;
      const response = await makeClientApiCall<DataproviderResponse>(
        url,
        method,
        data,
      );
      if (!response.success) {
        setErrorMessage(
          `Kan dataproviderdata niet opslaan: (${response.error})`,
        );
        return;
      }

      if (!response.result?.error) {
        if (props.onClose) {
          props.onClose(false);
        }
      } else {
        console.error(
          "API Error Response:",
          response.result?.error ||
            "Onbekende fout bij het opslaan van de dataprovider",
        );
        setErrorMessage("Fout bij het opslaan van de dataprovider");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleReset = () => {
    if (isNew) {
      setCompanyName(null);
      setUrlName(null);
      setPassword(null);
      setStatus(null);
    } else {
      setCompanyName(initialData.CompanyName);
      setUrlName(initialData.UrlName);
      setPassword(initialData.Password);
      setStatus(initialData.Status);
    }
  };

  const renderTopBar = (currentContact: VSContactDataprovider | undefined) => {

    const allowEdit = true; // TODO: check rights

    const contact = isNew ? DEFAULT_DATAPROVIDER : currentContact;
    const title: string =
      "" +
      (contact?.CompanyName || "") +
      (isNew ? " (Nieuw)" : "");
    const showUpdateButtons: boolean = isEditing;
    const allowSave: boolean = isDataChanged();
    return (
      <PageTitle className="flex w-full justify-center sm:justify-start">
        <div className="mr-4 hidden sm:block">{title}</div>
        {!isNew && allowEdit && !props.onClose && !isEditing && (
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
    <div
      style={{ minHeight: "65vh" }}
    >
      <div
        className="
        flex justify-between
        sm:mr-8
      "
      >
        {renderTopBar(activecontact)}
      </div>
      <div className="mt-4 w-full">
        {errorMessage && (
          <div className="mb-4 font-bold text-red-600">{errorMessage}</div>
        )}

        <FormInput
          label="Naam"
          value={CompanyName}
          onChange={e => setCompanyName(e.target.value)}
          required
        />
        <br />
        <FormInput
          label="ContractorID (datastandaard)"
          value={UrlName}
          onChange={e => setUrlName(e.target.value)}
        />
        <br />
        <FormInput
          label="Wachtwoord"
          value={Password}
          onChange={e => setPassword(e.target.value)}
        />
        <br />
        <FormSelect
                label="Status"
                value={Status || ""}
                onChange={(e) => setStatus(e.target.value || null)}
                required
                options={[
                    { label: "Actief", value: "1" },
                    { label: "Inactief", value: "0" },
                ]}
                disabled={!isEditing}
            />
      </div>
    </div>
  );
};

export default DataproviderEdit;
