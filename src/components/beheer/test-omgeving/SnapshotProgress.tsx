import React from "react";
import { Box, Checkbox, FormControlLabel, Typography } from "@mui/material";

export type SnapshotPhaseView = {
  id: string;
  label: string;
  state: "pending" | "active" | "done" | "error";
  detail: string;
};

export default function SnapshotProgress({ phases }: { phases: SnapshotPhaseView[] }) {
  return (
    <Box sx={{ mt: 2, border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Voortgang</Typography>
      {phases.map((phase) => (
        <Box key={phase.id}>
          <FormControlLabel
            sx={{ my: -0.5, alignItems: "center" }}
            control={(
              <Checkbox
                size="small"
                checked={phase.state === "done"}
                indeterminate={phase.state === "active"}
                color={phase.state === "error" ? "error" : "primary"}
                onChange={() => undefined}
                sx={{ pointerEvents: "none" }}
              />
            )}
            label={(
              <Typography variant="body2" color={phase.state === "pending" ? "text.secondary" : "text.primary"}>
                {phase.label}
              </Typography>
            )}
          />
          {phase.state === "active" && phase.detail ? phase.detail.split("\n").map((line) => (
            <Typography
              key={line}
              variant="body2"
              color={line.endsWith("· bezig") ? "text.primary" : "text.secondary"}
              sx={{ pl: 5, lineHeight: 1.4 }}
            >
              {line}
            </Typography>
          )) : null}
        </Box>
      ))}
    </Box>
  );
}
