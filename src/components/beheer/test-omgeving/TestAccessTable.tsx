import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Typography } from "@mui/material";

type Account = {
  kind: "beheer_data_eigenaar" | "beheer_exploitant" | "fms_dataprovider";
  label: string;
  login: string;
  password: string;
};

type AccessPayload = {
  exists: boolean;
  exploitantName?: string;
  accounts?: Account[];
};

const KIND_LABEL: Record<Account["kind"], string> = {
  beheer_data_eigenaar: "Beheer data-eigenaar",
  beheer_exploitant: "Beheer exploitant",
  fms_dataprovider: "FMS API (dataleverancier)",
};

type Props = {
  refreshKey?: number;
};

export default function TestAccessTable({ refreshKey = 0 }: Props) {
  const [data, setData] = useState<AccessPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/protected/test-env/test-access");
      const body = (await res.json()) as AccessPayload & { error?: string };
      if (!res.ok) {
        setData(null);
        return;
      }
      setData(body);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) return null;
  if (!data?.exists) return null;

  const rows = data.accounts ?? [];

  return (
    <Box sx={{ mt: 2, maxWidth: 820 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Testaccounts
      </Typography>
      {data.exploitantName && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Exploitant: {data.exploitantName}
        </Typography>
      )}
      {rows.length === 0 ? (
        <Alert severity="warning">
          Geen testaccounts gevonden. Maak de test data-eigenaar opnieuw aan om standaardaccounts te krijgen.
        </Alert>
      ) : (
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.875rem",
            border: 1,
            borderColor: "divider",
          }}
        >
          <Box component="thead">
            <Box component="tr" sx={{ bgcolor: "action.hover" }}>
              <Box component="th" sx={{ textAlign: "left", p: 1 }}>Rol</Box>
              <Box component="th" sx={{ textAlign: "left", p: 1 }}>Naam</Box>
              <Box component="th" sx={{ textAlign: "left", p: 1 }}>Inlog</Box>
              <Box component="th" sx={{ textAlign: "left", p: 1 }}>Wachtwoord</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((row) => (
              <Box component="tr" key={`${row.kind}-${row.login}`} sx={{ borderTop: 1, borderColor: "divider" }}>
                <Box component="td" sx={{ p: 1 }}>{KIND_LABEL[row.kind]}</Box>
                <Box component="td" sx={{ p: 1 }}>{row.label}</Box>
                <Box component="td" sx={{ p: 1, fontFamily: "monospace", fontSize: "0.8rem" }}>{row.login}</Box>
                <Box component="td" sx={{ p: 1, fontFamily: "monospace", fontSize: "0.8rem" }}>{row.password}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
