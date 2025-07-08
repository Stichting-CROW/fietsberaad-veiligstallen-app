import { useEffect, useState } from "react";
import moment from "moment";

import { getParkingColor } from "~/utils/theme";
import { openRoute } from "~/utils/map/index";

import { formatOpeningToday } from "~/utils/parkings-openclose";
import type { ParkingDetailsType } from "~/types/parking";

import Styles from "./ParkingFacilityBlock.module.css";

function ParkingFacilityBlock({
  parking,
  id,
  compact,
  openParkingHandler,
  expandParkingHandler,
  showButtons
}: {
  id?: any,
  parking: ParkingDetailsType,
  compact: boolean
  openParkingHandler?: Function,
  expandParkingHandler?: Function,
  showButtons?: false
}) {
  if(!parking) {
    return null;
  }

  const locationDescription = `${parking.Location || ""}${parking.Location && parking.Plaats ? ", " : ""
    }${parking.Plaats ? parking.Plaats : ''}`;

  let costDescription: string | undefined = "";
  switch (parking.Tariefcode) {
    case 1:
      costDescription = "betaald";
      break;
    case 2:
      costDescription = "gratis";
      break;
    case 3:
      // lijkt een testwaarde
      costDescription = "";
      break;
    case 4:
      costDescription = "gratis";
      break;
    case 5:
      costDescription = "gratis";
      break;
    case null:
      costDescription = "";
      break;
    default:
      costDescription = `tariefcode ${parking.Tariefcode}`;
      break;
  }

  const openingDescription = formatOpeningToday(parking, moment()).message;

  // const detailsLine = `${costDescription}${costDescription && openingDescription ? "| " : ""
  //   }${openingDescription}`;

  if (parking.ExtraServices) {
    // console.log('parking', parking)
  }

  // Set image
  let parkingImageUrl = parking.Image;
  // If no parking image was found: Show default image
  if (!parkingImageUrl) {
    parkingImageUrl = `/images/bike-blue-green.png`;
  }
  // If parking has an image URL not starting with http: Create veiligstallen URL
  else if (!parkingImageUrl.includes('http')) {
    parkingImageUrl = `https://static.veiligstallen.nl/library/fietsenstallingen/${parkingImageUrl}`;
  }

  return (
    <div
      id={id}
      className={`
        ParkingFacilityBlock
        relative
        flex w-full
        justify-between
        border-b
        border-solid
        border-gray-300
        px-5 pb-5
        pt-5
        cursor-pointer
        ${compact
          ? 'bg-white'
          : 'shadow-lg'
        }
      `}
      style={{
        backgroundColor: !compact ? 'rgba(31, 153, 210, 0.1)' : undefined
      }}
      onClick={() => {
        // Expand parking if expandParkingHandler was given
        if (expandParkingHandler && compact) {
          expandParkingHandler(parking.ID);
        }
        // Open parking details if ParkingBlock was already active
        else if (expandParkingHandler && openParkingHandler && !compact) {
          openParkingHandler(parking.ID);
        }
        // Open parking if no expand handler was given
        if (!expandParkingHandler && openParkingHandler)
          openParkingHandler(parking.ID);
      }}
    >
      <div
        data-name="left"
        className={`
          mr-2 hidden
          align-middle
          sm:inline-block ${Styles["icon-type"]}
        `}
        style={{
          marginTop: "5px",
          borderColor: getParkingColor(parking.Type),
        }}
      />
      <div data-name="right" className="flex-1">
        <div className="">
          <div className="h-6 overflow-hidden sm:h-auto">
            <b className="text-base">{parking.Title}</b>
          </div>
          <div className="text-sm text-gray-500 h-5 overflow-hidden" title={locationDescription}>
            {locationDescription}
          </div>
        </div>
        <div
          className="
          mt-2 flex justify-between
          text-sm text-gray-500
        "
        >
          <div className="">

            {!showButtons && costDescription + ' '}

            {showButtons && <div>
              <a
                onClick={(e) => {
                  e.preventDefault();
                  if (openParkingHandler) openParkingHandler(parking.ID);
                }}
                href="#"
                className="text-sm text-gray-500 underline p-1 inline-block"
              >
                meer informatie
              </a>
            </div>}
          </div>
          {costDescription && openingDescription ? (
            <div className="hidden sm:inline-block">|</div>
          ) : null}
          <div className="text-right">
            {!showButtons && openingDescription + ' '}
          </div>

          {(showButtons && parking.Coordinaten) && (<>
            <a href="" className="
              absolute right-5 bottom-5
              inline-block
              rounded-full shadow
              p-2
            " onClick={(e) => {
                e.preventDefault();
                openRoute(parking.Coordinaten)
              }}>
              <img src="/images/icon-route.png" alt="Open route" className="w-5" />
            </a>
          </>)}

        </div>
        {!compact && (
          <>
            <div className="mt-4 flex justify-between">
              <div className="flex text-sm text-gray-500">
                {/*
                <span className="mr-2">buggy-uitleen</span>
                <span className="mr-2">fietspomp</span>
                <span className="mr-2">fietsverhuur</span>
                <span className="mr-2">kluisjes</span>
                <span className="mr-2">opladen e-fiets</span>
                <span className="mr-2">toilet</span>
                <span>nog een icoon</span>
                */}
                <span>{parking.ExtraServices}</span>
              </div>
              <div>
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    if (openParkingHandler) {
                      openParkingHandler(parking.ID);
                    }
                  }}
                  href="#"
                  className="whitespace-nowrap text-sm text-gray-500 underline px-1 py-2 inline-block -px-1 -my-2"
                >
                  meer informatie
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ParkingFacilityBlock;
