import { useState } from "react";
import { useSelector } from "react-redux";

// Components
import Input from '@mui/material/TextField';
import MapboxMap from "~/components/MapComponent";
import ParkingFacilityBlock from "~/components/ParkingFacilityBlock";
import CardList from "~/components/CardList";
import { CardData } from "~/components/Card";
import FilterBox from "~/components/FilterBox";

const ParkingFacilities = ({ fietsenstallingen }: any) => {
  const [mapmode, setMapmode] = useState(true);
  const [isFilterBoxOpen, setIsFilterBoxOpen] = useState<boolean>(true);

  const activeTypes = useSelector(
    (state: AppState) => state.filter.activeTypes
  );

  const toggleParkingFacilitiesView = () => setMapmode(!mapmode);
  const toggleFilterBox = () => setIsFilterBoxOpen(!isFilterBoxOpen);
  const resetFilter = () => {};

  // console.log(
  //   "@@@@ activeTypes",
  //   JSON.stringify(
  //     fietsenstallingen.map((x) => ({
  //       n: x.Title,
  //       t: x.Type,
  //       a: activeTypes,
  //       r: activeTypes.indexOf(x.Type) > -1,
  //     })),
  //     null,
  //     2
  //   )
  // );

  const cards: CardData[] = fietsenstallingen.map((x: any, idx: number) => {
    return {
      ID: x.ID,
      title: x.Title,
      description: x.Description,
    };
  });

  return (
    <div data-name="parking-facilities">
      <div
        className="
        flex flex min-h-screen flex-col items-center justify-center
      "
      >
        {mapmode ? (
          <>
            <MapboxMap
              fietsenstallingen={fietsenstallingen.filter(
                (x) => activeTypes.indexOf(x.Type) > -1
              )}
            />
          </>
        ) : (
          <div className="mx-5 pt-24">
            {fietsenstallingen
              .filter((x) => activeTypes.indexOf(x.Type) > -1)
              .map((x: any) => {
                return <ParkingFacilityBlock key={x.title} parking={x} />;
              })}
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <div
          className="l-0 b-20 r-0 h-max-40 absolute"
          style={{
            position: "absolute",
            bottom: "10vh",
            left: 0,
            right: 0,
            maxHeight: "10vh",
          }}
        >
          <CardList cards={cards} />
        </div>
      </div>
      <div
        className="
        fixed
        bottom-5
        right-5
        rounded-full
        bg-white
        p-4
      "
        onClick={toggleParkingFacilitiesView}
      >
        MAPLIST
      </div>
      {isFilterBoxOpen && (
        <FilterBox
          isOpen={isFilterBoxOpen}
          onReset={resetFilter}
          onClose={toggleFilterBox}
        />
      )}
    </div>
  )
}

export default ParkingFacilities;
