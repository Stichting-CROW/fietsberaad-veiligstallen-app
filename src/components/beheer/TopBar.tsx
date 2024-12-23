import React, { useEffect } from "react";
import Link from "next/link";
import { contacts } from "@prisma/client";
import router , { useRouter } from "next/navigation";
import { type User } from "next-auth";
import { useSession, signOut } from "next-auth/react"

interface TopBarProps {
  title: string;
  currentComponent: string;
  user: User | undefined;
  gemeenten: contacts[] | undefined;
  selectedGemeenteID: string | undefined;
  onGemeenteSelect: (gemeente: string) => void;
}

const TopBar: React.FC<TopBarProps> = ({
  title,
  currentComponent,
  user,
  gemeenten,
  selectedGemeenteID,
  onGemeenteSelect,
}) => {
  const { push } = useRouter();
  const { data: session } = useSession()

  const handleGemeenteChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    event.preventDefault();
    onGemeenteSelect(event.target.value);
  };

  const handleLoginClick = () => {
    if (!session) {
      push('/login');
    } else {
      // sign out
      signOut();
    }
  };

  return (
    <div
      className="
      z-10 flex w-full items-center
      justify-between bg-white px-5 shadow
    "
    >
      <div style={{ flex: 1 }}>
        <img
          src="/images/logo.png"
          alt="Logo"
          className="h-16 w-auto bg-white p-2"
        />
      </div>
      <div
        className="
        primaryMenuItems-wrapper

        flex-start
        flex flex-1 flex-wrap
        overflow-hidden text-left
        opacity-100
        transition-opacity
        duration-500
      
      "
        style={{ flex: 4 }}
      >
        <div className="PrimaryMenuItem bock px-5">
          <a
            href="/"
            className="flex h-full flex-col justify-center"
            onClick={e => {
              e.preventDefault();
              push("/");
            }}
          >
            <img src="/images/icon-map.png" style={{ height: "30px" }} />
          </a>
        </div>
        <div className="PrimaryMenuItem px-5">
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </div>
      <div
        className="flex items-center justify-end space-x-4 text-sm"
        style={{ flex: 3 }}
      >
        {currentComponent !== "home" && (
          <Link href="/beheer" className="hover:underline">
            Beheer Home
          </Link>
        )}
        {gemeenten && (
          <select
            onChange={handleGemeenteChange}
            value={selectedGemeenteID || ""}
            className="rounded bg-gray-700 px-2 py-1 text-white"
          >
            <option key="select-gemeente-placeholder" value="">
              Selecteer gemeente
            </option>
            {gemeenten.map(gemeente => (
              <option
                key={`select-gemeente-option-${gemeente.ID}`}
                value={gemeente.ID}
              >
                {gemeente.CompanyName}
              </option>
            ))}
          </select>
        )}

        <a
          href="https://fms.veiligstallen.nl"
          target="_blank"
          className="
              mx-2
              flex
              h-10
              flex-col
              justify-center
              rounded-md
              px-4
              font-bold
              text-white
              shadow-lg
            "
          style={{
            backgroundColor: "#15aeef",
          }}
          title="Ga naar het oude FMS beheersysteem"
        >
          FMS
        </a>

        {user !== undefined ? (
          <button
            className="mx-2 h-10 rounded-md px-4 font-bold text-white shadow-lg"
            style={{
              backgroundColor: "#15aeef",
            }}
          >
            Log uit
          </button>
        ) : (
          <button
            className="mx-2 h-10 rounded-md px-4 font-bold text-white shadow-lg"
            style={{
              backgroundColor: "#15aeef",
            }}
          >
            Login
          </button>
        )}
      </div>
    </div>
  );
};

export default TopBar;
