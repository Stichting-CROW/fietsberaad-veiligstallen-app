// @ts-nocheck
import * as React from "react";
import { useDispatch, useSelector } from "react-redux";
import { setAuthState } from "~/store/authSlice";
import { AppState } from "~/store/store";
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useSession } from "next-auth/react";

// Import components
import Modal from "src/components/Modal";
import {Button} from "~/components/Button";

import {
  setIsMobileNavigationVisible
} from "~/store/appSlice";

// Import components
import Logo from './Logo';
import PageTitle from "~/components/PageTitle";

function WelcomeToMunicipality({
  municipalityInfo,
  buttonClickHandler
}: {
  municipalityInfo?: any,
  buttonClickHandler?: Function
}) {
  const { push } = useRouter();
  const { data: session } = useSession();

  const mapZoom = useSelector(
    (state: AppState) => state.map.zoom
  );

  if(session?.user) {
    console.log("NO WELCOME");
    return null;
  }

  if(mapZoom===undefined || mapZoom < 12 || ! municipalityInfo || municipalityInfo.CompanyName === "FIETSBERAAD") {
    return null;
  }

  return <div className="
    text-center
  ">
    <div data-name="bike-icon">
      <img
        src="/images/bike-blue-green.png"
        alt="Fiets"
        className="
          h-24
          mx-auto
          -mt-2
        "
      />
    </div>

    <h1 data-name="title" className="
      text-4xl
      font-bold
      my-6
      text-red-500
    "
    style={{
      color: `#${municipalityInfo.ThemeColor1}`
    }}
    >
      Welkom in {municipalityInfo.CompanyName}
    </h1>

    <p className="my-6">
      De kortste weg naar een veilige plek voor uw fiets in {municipalityInfo.CompanyName}.
    </p>

    <div className="my-6">
      <div>
        <Button onClick={(e) => {
          e.preventDefault();
          // Redirect
          const url = `/${municipalityInfo.UrlName}?typesFilter=bewaakt,onbewaakt,toezicht,geautomatiseerd`;
          push(url);
          // Close modal
          buttonClickHandler();
        }}
        className="mx-auto inline-block w-full py-3 text-center max-w-xs"
        style={{
          backgroundColor: `#${municipalityInfo.ThemeColor1}`,
          color: `#fff`
        }}
        >
          Zoek een openbare stalling
        </Button>
      </div>
      <div>
        <Button onClick={(e) => {
          e.preventDefault();
          // Redirect
          const url = `/${municipalityInfo.UrlName}?typesFilter=buurtstalling,fietstrommel,fietskluizen`;
          push(url);
          // Close modal
          buttonClickHandler();
        }}
        className="mx-auto inline-block w-full py-3 text-center max-w-xs"
        style={{
          backgroundColor: `#${municipalityInfo.ThemeColor1}`,
          color: `#fff`
        }}
        >
          Zoek een prive stalling
        </Button>
      </div>
    </div>

    <p className="mt-6">
      <a href={`/${municipalityInfo.UrlName}/home`} className="text-gray-500 underline" onClick={(e) => {
        e.preventDefault();
        push(`/${municipalityInfo.UrlName}/home`);
        // Close modal
        buttonClickHandler();
      }}>
        Parkeren in {municipalityInfo.CompanyName} - Hoe werkt het?
      </a>
    </p>

  </div>
}

export default WelcomeToMunicipality;
