// @ts-nocheck

import React from "react";
import "keen-slider/keen-slider.min.css";
import CardStyles from './Card.module.css';

import ParkingFacilityBlock from './ParkingFacilityBlock';
import { type ParkingDetailsType } from "~/types/parking";

export interface CardData {
  ID: string;
  title: string;
  description: string;
}

const Card: React.FC<CardData> = ({
  parkingdata,
  compact = true,
  expandParking,
  clickParking,
  showButtons = false
}: {
  parkingdata: ParkingDetailsType,
  compact: boolean,
  expandParking?: () => void,
  clickParking?: () => void,
  showButtons: boolean
}) => {
  if(!parkingdata) {
    return null;
  }

  return (
    <div
      key={`card-${parkingdata.ID}`}
      className={`
        ${CardStyles.base}
        keen-slider__slide
        flex
        flex-col
        rounded-lg
      `}
    >
      <ParkingFacilityBlock
        parking={parkingdata}
        key={parkingdata.ID}
        compact={compact}
        showButtons={showButtons}
        expandParkingHandler={expandParking}
        openParkingHandler={clickParking}
      />
    </div>
  );
};

export default Card;
