import Image from "next/image";
import { type ChangeEvent, type MouseEvent, useState } from "react";
import { Button } from "~/components/Button";
import ImageSlider from "~/components/ImageSlider";

type ContactEditLogoProps = {
  ID: string,
  CompanyLogo: string | null,
  CompanyLogo2: string | null,
  isLogo2?: boolean,
  onUpdateAfbeelding?: Function
}

// based on https://codersteps.com/articles/how-to-build-a-file-uploader-with-next-js-and-formidable
const ContactEditLogo = ({ ID, CompanyLogo, CompanyLogo2, isLogo2, onUpdateAfbeelding }: ContactEditLogoProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const logoField = isLogo2 ? "CompanyLogo2" : "CompanyLogo";
  const baseUrl = isLogo2 ? "https://static.veiligstallen.nl/library/logo2/" : "https://static.veiligstallen.nl/library/logo/";

  const onRemoveAfbeelding = async () => {
    const update = { [logoField]: null }
    try {
      const result = await fetch(
        "/api/protected/gemeenten/removeLogo/" + ID,
        {
          method: "PUT",
          body: JSON.stringify(update),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!result.ok) {
        throw Error('Er ging iets fout bij het verwijderen. Probeer je het later nog eens.')
      }

      onUpdateAfbeelding && onUpdateAfbeelding();
    } catch (err) {
      console.error('onRemoveAfbeelding - error', err);
    }
  }

  const onFileUploadChange = (e: ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;

    if (!fileInput.files || fileInput.files.length === 0 || !fileInput.files[0]) {
      console.warn("Files list is empty");
      return;
    }

    const file = fileInput.files[0];

    /** File validation */
    if (!file.type.startsWith("image")) {
      alert("Ongeldig bestandstype geselecteerd. Alleen afbeeldingen zijn toegestaan.");
      return;
    }

    /** Setting file state */
    setFile(file); // we will use the file state, to send it later to the server
    setPreviewUrl(URL.createObjectURL(file)); // we will use this to show the preview of the image

    /** Reset file input */
    e.currentTarget.type = "text";
    e.currentTarget.type = "file";
  };

  const onCancelFile = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!previewUrl && !file) {
      return;
    }
    setFile(null);
    setPreviewUrl(null);
  };

  const onUploadFile = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!file) {
      console.warn("Missing parking data or file");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("media", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const {
        data,
        error,
      }: {
        data: {
          url: string | string[];
        } | null;
        error: string | null;
      } = await res.json();

      if (error || !data) {
        alert(error || "Er ging iets fout bij het opslaan. Probeer je het later nog eens.");
        return;
      }

      // Check if parking was changed
      const update = { [logoField]: data.url[0] }
      try {
        const result = await fetch(
          "/api/protected/gemeenten/" + ID,
          {
            method: "PUT",
            body: JSON.stringify(update),
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        if (!result.ok) {
          throw Error('Er ging iets fout bij het opslaan. Probeer je het later nog eens.')
        }

        onUpdateAfbeelding && onUpdateAfbeelding();
      } catch (err: any) {
        if (err.message) alert(err.message);
        else alert(err);
      }

      // onUpdateAfbeelding(data.url);
    } catch (error) {
      console.error(error);
      alert("Er ging iets fout bij het opslaan. Probeer je het later nog eens.");
    }
  };

  // https://static.veiligstallen.nl/library/logo2/logo-gemeente-utrecht-nederlands-klein-300.png

  const logoValueSet = 
    (isLogo2 && CompanyLogo2!==null) || 
    (!isLogo2 && CompanyLogo!==null);
    
  if (logoValueSet) {
    // render current image
    const logoValue = (isLogo2 ? CompanyLogo2 : CompanyLogo)||"";
    return (
      <div className="w-full flex flex-col justify-center p-3 border border-gray-500 border-dashed">
        <div className="mx-auto">
          <ImageSlider images={[logoValue]} baseUrl={baseUrl} />
        </div>
        <Button
          className="mt-4 w-max-content mx-auto"
          onClick={onRemoveAfbeelding}
        >
          Afbeelding verwijderen
        </Button>
      </div>
    )
  } else if (previewUrl) {
    // render preview image
    return (
      <div className="w-full flex flex-col justify-center p-3 border border-gray-500 border-dashed">
        <div className="mx-auto">
          <div className="w-full text-2xl font-medium text-center">Voorbeeld:</div>
          <Image
            alt="file uploader preview"
            objectFit="cover"
            src={previewUrl}
            width={512}
            height={512}
            layout="fixed"
          />
        </div>
        <Button
          className="w-content mx-auto mt-4"
          onClick={onUploadFile}>
          Afbeelding gebruiken
        </Button>
        <Button
          className="w-content mx-auto mt-2"
          onClick={onCancelFile}>
          Afbreken
        </Button>
      </div>
    );
  } else {
    // render upload input
    return (
      <div className="w-full flex flex-col justify-center p-3 border border-gray-500 border-dashed">
        <label className="flex flex-col items-center justify-center h-full py-3 transition-colors duration-150 cursor-pointer hover:text-gray-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-14 h-14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
            />
          </svg>
          <strong className="text-sm font-medium">Klik hier om een afbeelding te selecteren</strong>
          <input
            className="block w-0 h-0"
            name="file"
            type="file"
            onChange={onFileUploadChange}
          />
        </label>
      </div>
    );
  }
};

export default ContactEditLogo;