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
import DataproviderLinkedStallings from "~/components/contact/DataproviderLinkedStallings";

type DataproviderEditProps = {
  id: string;
  onClose?: (confirmClose: boolean) => void;
};

const DEFAULT_DATAPROVIDER: VSContactDataprovider = getDefaultNewDataprovider(
  "Testdataprovider " + new Date().toISOString(),
);

function generateRandomPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

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
        Password: "",
        Status: DEFAULT_DATAPROVIDER.Status,
      };

      setCompanyName(initial.CompanyName);
      setUrlName(initial.UrlName);
      setPassword("");
      setStatus(initial.Status);

      setInitialData(initial);
    } else if (activecontact) {
      const initial = {
        CompanyName: activecontact.CompanyName || initialData.CompanyName,
        UrlName: activecontact.UrlName || initialData.UrlName,
        Password: "",
        Status: activecontact.Status || initialData.Status,
      };

      setCompanyName(initial.CompanyName);
      setUrlName(initial.UrlName);
      setPassword("");
      setStatus(initial.Status);

      setInitialData(initial);
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
    const passwordTrimmed = (Password ?? "").trim();
    if (!CompanyName || !UrlName || !Status) {
      setErrorMessage("Naam, ContractorID en Status zijn verplichte velden");
      return;
    }
    if (isNew && !passwordTrimmed) {
      setErrorMessage("Wachtwoord is verplicht bij een nieuwe dataleverancier (vul in of kies Random)");
      return;
    }

    const id = false === isNew ? props.id : "new";

    try {
      const data: Partial<VSContactDataprovider> = {
        ID: id,
        ItemType: VSContactItemType.Dataprovider,
        CompanyName,
        UrlName,
        Status,
      };
      if (passwordTrimmed) {
        data.Password = passwordTrimmed;
      }

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
      setPassword("");
      setStatus(null);
    } else {
      setCompanyName(initialData.CompanyName);
      setUrlName(initialData.UrlName);
      setPassword("");
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
        <label className="block">
          <div>
            <b>Wachtwoord</b>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={Password ?? ""}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="my-2 w-full rounded-full border px-5 py-2"
            />
            <button
              type="button"
              onClick={() => setPassword(generateRandomPassword())}
              className="whitespace-nowrap rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            >
              Random
            </button>
          </div>
        </label>
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
        {!isNew && <DataproviderLinkedStallings operatorId={props.id} />}
      </div>
    </div>
  );
};

export default DataproviderEdit;
