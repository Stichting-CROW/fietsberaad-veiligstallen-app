import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { AppState } from "~/store/store";

import type { ParkingDetailsType } from "~/types/parking";
import type { fietsenstallingen } from "@prisma/client";

import { getParkingDetails, getNewStallingDefaultRecord } from "~/utils/parkings";

import Modal from "src/components/Modal";
import ParkingEdit from "~/components/parking/ParkingEdit";
import ParkingView from "~/components/parking/ParkingView";
import toast from 'react-hot-toast';

const Parking = ({ id, stallingId, fietsenstallingen, onStallingIdChanged, onClose }: { id: string, stallingId: string | undefined, fietsenstallingen: fietsenstallingen[], onStallingIdChanged: (newId: string | undefined) => void, onClose: () => void }) => {
  const session = useSession();
  // const router = useRouter();

  const [currentRevision, setCurrentRevision] = useState<number>(0);
  const [currentStalling, setCurrentStalling] = useState<ParkingDetailsType | null>(null);
  const [editMode, setEditMode] = React.useState(false);

  useEffect(() => {
    if (stallingId !== undefined) {
      getParkingDetails(stallingId).then((stalling) => {
        if (null !== stalling) {
          setCurrentStalling(stalling);
        } else {
          console.error("Failed to load stalling with ID: " + stallingId);
          setCurrentStalling(null);
        }
      });
    } else {
      setCurrentStalling(null);
    }
  }, [
    stallingId,
    currentRevision
  ]);

  useEffect(() => {
    if (currentStalling && (currentStalling.Status == "aanm")) {
      setEditMode(true);
    }
  }, [currentStalling]);

  const handleCloseEdit = (closeModal: boolean) => {
    setEditMode(false);

    if (closeModal) {
      onClose();
    }
  }

  const handleUpdateRevision = () => {
    setCurrentRevision(currentRevision + 1);
  }

  const handleToggleStatus = async () => {
    if (!currentStalling) { return }

    const result = await fetch(
      "/api/fietsenstallingen?id=" + currentStalling.ID,
      {
        method: "PUT",
        body: JSON.stringify({ Status: currentStalling.Status === "0" ? "1" : "0" }),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!result.ok) {
      throw Error('Er ging iets fout bij het opslaan. Probeer het later opnieuw.')
    }
    toast(currentStalling.Status === "0" ? "De stalling is nu zichtbaar voor alle gebruikers" : "De stalling is nu alleen zichtbaar voor de beheerder");
    setCurrentRevision(currentRevision + 1);
  }

  if (null === currentStalling) {
    return null;
  }

  let allowEdit = session.status === "authenticated" || currentStalling && currentStalling.Status === "aanm";

  let content = undefined;
  if (allowEdit === true && (editMode === true)) {
    content = (<ParkingEdit parkingdata={currentStalling} onClose={handleCloseEdit} onChange={handleUpdateRevision} />);
  } else {
    content = (<ParkingView parkingdata={currentStalling} fietsenstallingen={fietsenstallingen} onEdit={allowEdit ? () => { setEditMode(true) } : undefined} onToggleStatus={handleToggleStatus} isLoggedIn={session.status === "authenticated"} />);
  }

  return (
    <Modal
      key={id}
      onClose={() => {
        if (editMode) {
          if (confirm('Wil je het bewerkformulier verlaten?')) {
            setEditMode(false);
            onStallingIdChanged(undefined)
          }
        } else {
          onStallingIdChanged(undefined);
        }
      }}
      clickOutsideClosesDialog={false}
    >
      {content}
    </Modal >
  )
};

export default Parking;
