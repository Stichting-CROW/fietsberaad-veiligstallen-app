// @ts-nocheck

import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import Card from "./Card";
import { useKeenSlider } from "keen-slider/react";
import "keen-slider/keen-slider.min.css";
import { type AppState } from "~/store/store";
import type { ParkingDetailsType } from "~/types/parking";

import {
  setSelectedParkingId
} from "~/store/mapSlice";

interface Props {
  allparkingdata: ReportBikepark[];
  onShowStallingDetails?: (id: string) => void;
}

interface MapFeature {
  id: string;
}

const sliderProps = {
  slides: {
    perView: typeof window !== 'undefined' ? (window.innerWidth / 315) : 1.3,
    spacing: 15,
  },
  // dragStarted: () => {
    
  // },
  // dragEnded: () => {
    
  // },
  // animationEnded: () => {
    
  // },
  // slideChanged: () => {
  //   // We don't use this below, as we navigate to the Parking on first tap
  //   // const index: number = event.track.details.abs;
  //   // slideChangedHandler(index)
  // }
}

const CardList: React.FC<Props> = ({
  allparkingdata,
  onShowStallingDetails
}: Props) => {
  const dispatch = useDispatch();

  const [visibleParkings, setVisibleParkings] = useState<ParkingDetailsType[]>(allparkingdata);

  const mapVisibleFeatures = useSelector(
    (state: AppState) => (state.map ).visibleFeatures as MapFeature[]
  );

  const selectedParkingId = useSelector(
    (state: AppState) => (state.map ).selectedParkingId
  );

  const mapExtent = useSelector((state: AppState) => (state.map ).extent);

  const [sliderRef, slider] = useKeenSlider<HTMLDivElement>(sliderProps);

  // If mapVisibleFeatures change: Filter parkings
  useEffect(() => {
    if (!allparkingdata) return;
    if (!mapVisibleFeatures) return;

    const allParkings = allparkingdata;
    const visibleParkingIds = mapVisibleFeatures.map(x => x.id);
    // Only keep parkings that are visible on the map
    const filtered = allParkings.filter((x) => visibleParkingIds.indexOf(x.ID) > -1);

    // Set filtered parkings into a state variable
    setVisibleParkings(filtered);
  }, [
    allparkingdata,
    mapVisibleFeatures,
    mapVisibleFeatures.length
  ])

  // If map extent changes: Move to correct parking slide if needed
  useEffect(() => {
    if (!visibleParkings) return;

    // After map update: Is selectedParkingId still visible? If so: Slide to parking card
    let isSelectedParkingStillVisible = false, selectedParkingIndex: number;
    visibleParkings.forEach((x, idx) => {
      if (x.ID === selectedParkingId) {
        isSelectedParkingStillVisible = true;
        selectedParkingIndex = idx;
      }
    });

    // Wait 50 ms so that the map flyTo animation is fully done before sliding to the right card
    setTimeout(() => {
      // Check if slider (still) exists
      if (!slider || !slider.current) return;
      // Slide to card
      const cardToSlideTo = isSelectedParkingStillVisible ? selectedParkingIndex : 0;
      slider.current.update(sliderProps, cardToSlideTo);
    }, 50)
  }, [
    mapExtent,
    visibleParkings,
  ])

  // Scroll to selected parking if selected parking changes
  // useEffect(() => {
  //   // Stop if no parking was selected
  //   if(! selectedParkingId) return;
  //   if(! slider) return;

  //   // Find index of selected parking
  //   // Move to current slide, but wait on the flyTo animation first.
  //   // curve: 1 & speed: 0.2 => 1*0.2 = 0.2s
  //   if(selectedParkingId) {
  //     const idx = findParkingIndex(visibleParkings, selectedParkingId);
  //     slider.current.moveToIdx(idx);
  //   }
  // }, [selectedParkingId]);

  const expandParking = (id: string) => {
    // Set active parking ID
    dispatch(setSelectedParkingId(id));
  };

  const clickParking = (id: string) => {
    // Set URL
    // window.history.replaceState(null, document.title, `/stalling/${id}`); // Only change URL
    // push(`/stalling/${id}`);// Redirect
    // Set active parking ID
    dispatch(setSelectedParkingId(id));

    onShowStallingDetails && onShowStallingDetails(id);
  };

  // const slideChangedHandler = (index: number) => {
  //   // Find related parking
  //   const foundParking = allparkingdata[index];
  //   dispatch(setSelectedParkingId(foundParking.ID));
  // }
  if(!visibleParkings) return null;

  const isCardListVisible = true;

  return (
    <div className={`
      card-list
      transition-opacity
      ${isCardListVisible ? 'opacity-100' : 'opacity-0'}
    `}>
      <div ref={sliderRef} className={`card-list__slides keen-slider px-5`}>
        {visibleParkings && visibleParkings.map((parking, idx) => {
          if(!parking) {
             console.log("CardList - parking undefined:", parking, "idx:", idx);
          }

          return (
            <Card
              key={`c-${parking.ID}`}
              parkingdata={parking}
              compact={true}
              showButtons={selectedParkingId === parking.ID}
              expandParking={expandParking}
              clickParking={clickParking}
            />
          )
        })}
      </div>
    </div>
  );
};

export default CardList;
