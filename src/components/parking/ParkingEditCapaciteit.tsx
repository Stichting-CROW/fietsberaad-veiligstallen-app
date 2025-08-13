import React, { useEffect } from "react";
import FormInput from "~/components/Form/FormInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import { type ParkingDetailsType, type ParkingSectionPerBikeType, type ParkingSections } from '~/types/parking';

import { VSFietstype, VSFietsTypenWaarden } from "~/types/fietstypen";

export type CapaciteitType = { ID: string, Name: string };

export type capacitydata = {
  unknown: boolean;
  total: number;
  detailed: {
    [key: string]: { // fietstype
      Toegestaan: boolean;
      Capaciteit: number;
    }
  };
};

const calculateCapacityData = (parkingdata: ParkingDetailsType, allFietstypen: VSFietstype[]): capacitydata | null => {
  try {
    const capacity: capacitydata = {
      unknown: false,
      total: 0,
      detailed: allFietstypen.reduce((acc: { [key: string]: { Toegestaan: boolean; Capaciteit: number } }, fietstype, idx: number) => {
        acc[fietstype.Name ? fietstype.Name : 'fietstype' + idx] = {
          Toegestaan: false,
          Capaciteit: 0
        };
        return acc;
      }, {})
    };

    if (parkingdata === null) {
      console.error("getCapacityDataForParking - parking is null");
      capacity.unknown = true;
    } else if (undefined !== parkingdata.fietsenstalling_secties) {
      // Get parking section (new: 1 per parking, to make it easy)
      parkingdata.fietsenstalling_secties && parkingdata.fietsenstalling_secties.forEach((sectie) => {
        // Get capactity per modality for this parking section
        sectie.secties_fietstype.forEach(data => {
          const name = data.fietstype.Name;
          if (name in capacity.detailed === false) {
            console.warn("getCapacityDataForParking - fietstype not found in allFietstypen: ", name);
            capacity.detailed[name] = {
              Toegestaan: false,
              Capaciteit: 0,
            }
          }

          const item = capacity.detailed[name];
          if (item) {
            item.Toegestaan = item.Toegestaan || data.Toegestaan !== null && data.Toegestaan;
            item.Capaciteit += data.Capaciteit || 0;
            capacity.total += data.Capaciteit || 0;
          }
        });
      });
    } else {
      // no sections available yet: use default values
    }

    return capacity;
  } catch (e: any) {
    console.error("getCapacityDataForParking - error:", e.message);
    return null;
  }
};

const getCapacityForFietstype = (fietstypeName: string, capacitydata: capacitydata | null, localChanges: ParkingSections | undefined) => {
  if (!capacitydata) return 0;

  // First, check if we have the value in our local changes
  if (localChanges) {
    let foundRelated = undefined;
    if (localChanges.length > 0 && localChanges[0] !== undefined) {
      foundRelated = localChanges[0].secties_fietstype.filter((x) => {
        return x.fietstype.Name === fietstypeName;
      }).pop();
      if (foundRelated) {
        return Number(foundRelated.Capaciteit);
      }
    }
  }

  // If not, get the original value from the database
  const capacityForFietstype = capacitydata.detailed[fietstypeName];
  if (capacityForFietstype && capacityForFietstype.Capaciteit) {
    return Number(capacityForFietstype.Capaciteit);
  }

  return 0;
}

const getAllowedValueForFietstype = (fietstypeName: string, capacitydata: capacitydata | null, localChanges: ParkingSections | undefined): boolean => {
  if (!capacitydata) return false;

  // First, check if we have the value in our local changes
  if (localChanges && localChanges[0]) {
    const foundRelated = localChanges[0].secties_fietstype.find((x) => { return x.fietstype.Name === fietstypeName });
    if (foundRelated) {
      return foundRelated.Toegestaan || false;
    }
  }

  // If not, get the original value from the database
  const capacityForFietstype = capacitydata.detailed[fietstypeName];
  if (capacityForFietstype && capacityForFietstype.Toegestaan) {
    return true;
  }

  return false;
}

const toggleActive = (fietsenstalling_secties: ParkingSections, fietstypename: string, isActive: boolean): ParkingSections => {

  const sectieNotSetYet =
    fietsenstalling_secties === undefined ||
    fietsenstalling_secties[0] === undefined

  let didUpdateSomething = false;
  if (sectieNotSetYet) {
    didUpdateSomething = true;
    const newData: ParkingSections = [
      {
        titel: "sectie",
        secties_fietstype: [
          {
            Toegestaan: isActive,
            Capaciteit: 0,
            fietstype: { Name: fietstypename }
          }
        ]
      }
    ]
    return newData;
  } else if (fietsenstalling_secties[0] !== undefined) {
    // Update the isActive/'Toegestaan' value for the 'fietstype' given
    fietsenstalling_secties[0].secties_fietstype =
      fietsenstalling_secties[0].secties_fietstype.map(x => {
        if (x.fietstype.Name === fietstypename) {
          didUpdateSomething = true;
        }
        // Update 'Toegestaan' value if needed
        return {
          Capaciteit: x.Capaciteit,
          fietstype: x.fietstype,
          Toegestaan: x.fietstype.Name === fietstypename
            ? isActive // Update
            : x.Toegestaan // Or keep existing value
        }
      });

    if (!didUpdateSomething) {
      // If above script didn't update a value, we should add this fietstypeName
      const newObject: ParkingSectionPerBikeType = {
        Toegestaan: isActive,
        Capaciteit: 0,
        fietstype: { Name: fietstypename }
      }
      // Add new object for this fietstype
      fietsenstalling_secties[0].secties_fietstype.push(newObject);
    }
  }

  return fietsenstalling_secties;
}

const handleCapacityChange = (fietsenstalling_secties: ParkingSections, fietstypename: string, amountstr: string): ParkingSections => {

  const sectieNotSetYet =
    fietsenstalling_secties === undefined ||
    fietsenstalling_secties[0] === undefined

  // check for valid amount
  let amount = 0
  try {
    amount = parseInt(amountstr);
  } catch (e) {
    console.error("handleCapacityChange - amount is not a number");
    return fietsenstalling_secties;
  }

  let didUpdateSomething = false;
  if (sectieNotSetYet) {
    didUpdateSomething = true;
    const newData: ParkingSections = [
      {
        titel: "sectie",
        secties_fietstype: [
          {
            Toegestaan: false,
            Capaciteit: amount,
            fietstype: { Name: fietstypename }
          }
        ]
      }
    ]
    return newData;
  } else if (fietsenstalling_secties[0] !== undefined) {
    // Update the isActive/'Toegestaan' value for the 'fietstype' given
    fietsenstalling_secties[0].secties_fietstype =
      fietsenstalling_secties[0].secties_fietstype.map(x => {
        if (x.fietstype.Name === fietstypename) {
          didUpdateSomething = true;
        }
        // Update 'Toegestaan' value if needed
        return {
          Capaciteit: x.fietstype.Name === fietstypename ? amount : x.Capaciteit,
          fietstype: x.fietstype,
          Toegestaan: x.Toegestaan
        }
      });

    if (!didUpdateSomething) {
      // If above script didn't update a value, we should add this fietstypeName
      const newObject = {
        Toegestaan: false,
        Capaciteit: amount,
        fietstype: {
          Name: fietstypename
        }
      }
      // Add new object for this fietstype
      fietsenstalling_secties[0].secties_fietstype.push(newObject);
    }
  }

  return fietsenstalling_secties;
}

const ParkingEditCapaciteit = ({
  parkingdata,
  capaciteitChanged,
  update,
}: {
  parkingdata: ParkingDetailsType,
  capaciteitChanged: Function,
  update: ParkingSections
}) => {
  const [capacitydata, setCapacitydata] = React.useState<capacitydata | null>(null);

  // Set 'allFietstypen' local state
  useEffect(() => {
    (async () => {
      setCapacitydata(calculateCapacityData(parkingdata, VSFietsTypenWaarden));
    })();
  }, [])

  let content = null;
  if (capacitydata === null || capacitydata?.unknown) {
    content = "Onbekend";
  } else if (capacitydata.detailed === null) {
    content = (
      <>
        <div className="">{parkingdata.Capacity}</div>
        <div className="text-right"></div>
      </>
    );
  } else {
    content = Object.keys(capacitydata.detailed).map(key => {
      const detail = capacitydata.detailed[key];
      if (detail === undefined) {
        return null;
      } else if (detail.Toegestaan === false) {
        return (
          <>
            <div className="">{key}</div>
            <div className="text-right">Niet toegestaan</div>
          </>
        );
      } else if ((detail.Capaciteit || 0) > 0) {
        return (
          <>
            <div className="">{key}</div>
            <div className="text-right">{detail.Capaciteit}</div>
          </>
        );
      } else {
        return null;
      }
    });
  }

  return (
    <>
      <div className="ml-2 grid grid-cols-4">
        {capacitydata && Object.keys(capacitydata.detailed).map(fietstypename => {
          const item = capacitydata.detailed[fietstypename];

          const capacity = getCapacityForFietstype(fietstypename, capacitydata, update);
          const isAllowed = getAllowedValueForFietstype(fietstypename, capacitydata, update);
          return <React.Fragment key={'ft-' + fietstypename}>
            <div className="col-span-2 flex flex-col justify-center">
              {fietstypename}
            </div>
            <div className="flex flex-col justify-center">
              <FormInput
                type="number"
                defaultValue={capacity}
                size={4}
                onChange={(e) => {
                  const newFietsenstallingSecties = handleCapacityChange(parkingdata.fietsenstalling_secties, fietstypename, e.target.value);
                  capaciteitChanged(newFietsenstallingSecties)
                }}
                style={{ width: '100px' }}
              />
            </div>
            <div className=" flex flex-col justify-center">
              <FormCheckbox
                defaultChecked={false === isAllowed}
                onChange={(e) => {
                  if (null === parkingdata.fietsenstalling_secties) return;
                  if (null === fietstypename) return;

                  const newFietsenstallingSecties = toggleActive(parkingdata.fietsenstalling_secties, fietstypename, e.target.checked === false);
                  const getNewCapacity = () => {
                    const newCapacity = parkingdata;
                    newCapacity.fietsenstalling_secties = newFietsenstallingSecties;
                    return newCapacity;
                  };
                  capaciteitChanged(getNewCapacity().fietsenstalling_secties)
                }}
              >
                {'Niet toegestaan'}
              </FormCheckbox>
            </div>
          </React.Fragment>
        })}
      </div>
    </>
  );
};

export default ParkingEditCapaciteit;
