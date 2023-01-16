import {
  getGlobalStore,
  useConfig,
  useSession,
  useStore,
} from "@openmrs/esm-framework";
import { Button } from "@carbon/react";
import React, { useCallback, useContext, useEffect, useState } from "react";
import PatientCard from "../patient-card/PatientCard";
import styles from "./styles.scss";
import { useTranslation } from "react-i18next";
import GroupFormWorkflowContext from "../context/GroupFormWorkflowContext";
import FormBootstrap from "../FormBootstrap";
import useStartVisit from "../hooks/useStartVisit";
import CompleteModal from "../CompleteModal";
import CancelModal from "../CancelModal";

const formStore = getGlobalStore("ampath-form-state");

const WorkflowNavigationButtons = () => {
  const context = useContext(GroupFormWorkflowContext);
  const {
    activeFormUuid,
    validateForNext,
    submitForNext,
    patientUuids,
    activePatientUuid,
    workflowState,
  } = context;
  const store = useStore(formStore);
  const formState = store[activeFormUuid];
  const navigationDisabled =
    formState !== "ready" || workflowState !== "EDIT_FORM";
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const { t } = useTranslation();

  const isLastPatient =
    activePatientUuid === patientUuids[patientUuids.length - 1];

  const handleClickNext = () => {
    if (workflowState === "EDIT_FORM") {
      //validateForNext();
      submitForNext();
    }
  };

  return (
    <>
      <div className={styles.rightPanelActionButtons}>
        <Button
          kind="primary"
          onClick={handleClickNext}
          disabled={navigationDisabled}
        >
          {isLastPatient
            ? t("saveForm", "Save Form")
            : t("nextPatient", "Next Patient")}
        </Button>
        <Button kind="secondary" onClick={() => setCompleteModalOpen(true)}>
          {t("saveAndComplete", "Save & Complete")}
        </Button>
        <Button kind="tertiary" onClick={() => setCancelModalOpen(true)}>
          {t("cancel", "Cancel")}
        </Button>
      </div>
      <CancelModal
        open={cancelModalOpen}
        setOpen={setCancelModalOpen}
        context={context}
      />
      <CompleteModal
        open={completeModalOpen}
        setOpen={setCompleteModalOpen}
        context={context}
        validateFirst={false}
      />
    </>
  );
};

const GroupSessionWorkspace = () => {
  const { groupSessionConcepts } = useConfig();
  const { t } = useTranslation();
  const {
    patientUuids,
    activePatientUuid,
    editEncounter,
    encounters,
    activeEncounterUuid,
    activeVisitUuid,
    activeFormUuid,
    saveEncounter,
    activeSessionMeta,
    groupVisitTypeUuid,
    updateVisitUuid,
    submitForNext,
    workflowState,
    submitForComplete,
  } = useContext(GroupFormWorkflowContext);

  const { user, sessionLocation } = useSession();
  const [encounter, setEncounter] = useState(null);
  const [visit, setVisit] = useState(null);

  const {
    saveVisit,
    updateEncounter,
    success: visitSaveSuccess,
  } = useStartVisit({
    showSuccessNotification: false,
    showErrorNotification: true,
  });

  // 0. user clicks "next patient" in WorkflowNavigationButtons
  // which triggers validateForNext() if workflowState === "EDIT_FORM"

  // 1. validate the form
  // if the form is valid, save a visit for the user
  // handleOnValidate is a callback passed to the form engine.
  const handleOnValidate = useCallback(
    (valid) => {
      if (valid && !activeVisitUuid && !visit) {
        // // make a visit
        // // we will not persist this state or update the reducer
        // const date = new Date(activeSessionMeta.sessionDate);
        // date.setHours(date.getHours() + 1);
        // saveVisit({
        //   patientUuid: activePatientUuid,
        //   startDatetime: activeSessionMeta.sessionDate,
        //   stopDatetime: date.toISOString(),
        //   visitType: groupVisitTypeUuid,
        //   location: sessionLocation?.uuid,
        // });
      } else if (valid && activeVisitUuid) {
        // there is already a visit for this form
        submitForNext();
      }
    },
    [
      activePatientUuid,
      activeSessionMeta,
      groupVisitTypeUuid,
      saveVisit,
      activeVisitUuid,
      submitForNext,
      visit,
    ]
  );

  useEffect(() => {
    if (encounter && visit) {
      // Update encounter so that it belongs to the created visit
      updateEncounter({ uuid: encounter.uuid, visit: visit.uuid });
    }
  }, [encounter, visit]);

  // 2. save the new visit uuid and start form submission
  useEffect(() => {
    if (visitSaveSuccess) {
      setVisit(visitSaveSuccess.data);
      const visitUuid = visitSaveSuccess?.data?.uuid;
      if (!activeVisitUuid) {
        updateVisitUuid(visitUuid);
      }
      if (workflowState === "VALIDATE_FOR_NEXT") {
        submitForNext();
      }
      if (workflowState === "VALIDATE_FOR_COMPLETE") {
        submitForComplete();
      }
    }
  }, [
    visitSaveSuccess,
    updateVisitUuid,
    submitForNext,
    workflowState,
    activeVisitUuid,
    submitForComplete,
    visit,
    setVisit,
  ]);

  // 3. on form payload creation inject the activeVisitUuid
  const handleEncounterCreate = useCallback(
    (payload) => {
      payload.location = sessionLocation?.uuid;
      // Create a visit with the same date as the encounter being saved
      const visitStopDatetime = new Date(
        activeSessionMeta.sessionDate
      ).toISOString();
      saveVisit({
        patientUuid: activePatientUuid,
        startDatetime: activeSessionMeta.sessionDate,
        stopDatetime: activeSessionMeta.sessionDate,
        visitType: groupVisitTypeUuid,
        location: sessionLocation?.uuid,
      });

      const obsTime = new Date(activeSessionMeta.sessionDate);
      payload.obs.forEach((item, index) => {
        payload.obs[index] = {
          ...item,
          groupMembers: item.groupMembers?.map((mem) => ({
            ...mem,
            obsDatetime: obsTime.toISOString(),
          })),
          obsDatetime: obsTime.toISOString(),
        };
      });
      Object.entries(groupSessionConcepts).forEach(([field, uuid]) => {
        payload.obs.push({ concept: uuid, value: activeSessionMeta?.[field] });
      });
      payload.encounterDatetime = obsTime.toISOString();
    },
    [
      activePatientUuid,
      activeVisitUuid,
      activeSessionMeta,
      groupSessionConcepts,
      groupVisitTypeUuid,
    ]
  );

  // 4. Once form has been posted, save the new encounter uuid so we can edit it later
  const handlePostResponse = useCallback(
    (encounter) => {
      if (encounter && encounter.uuid) {
        saveEncounter(encounter.uuid);
        setEncounter(encounter);
      }
    },
    [saveEncounter]
  );

  if (workflowState === "NEW_GROUP_SESSION") return null;

  return (
    <div className={styles.workspace}>
      <div className={styles.formMainContent}>
        <div className={styles.formContainer}>
          <FormBootstrap
            patientUuid={activePatientUuid}
            encounterUuid={activeEncounterUuid}
            {...{
              formUuid: activeFormUuid,
              handlePostResponse,
              handleOnValidate,
              handleEncounterCreate,
            }}
          />
        </div>
        <div className={styles.rightPanel}>
          <h4>{t("formsFilled", "Forms filled")}</h4>
          <div className={styles.patientCardsSection}>
            {patientUuids?.map((patientUuid) => (
              <PatientCard
                key={patientUuid}
                {...{
                  patientUuid,
                  activePatientUuid,
                  editEncounter,
                  encounters,
                }}
              />
            ))}
          </div>
          <WorkflowNavigationButtons />
        </div>
      </div>
    </div>
  );
};

export default GroupSessionWorkspace;
