export type VSmodule = {
  ID: string,
  Name: string,
  parent: string | null,
}

export const AVAILABLE_MODULES: VSmodule[] = [
    {
        ID: "abonnementen",
        Name: "Abonnementen",
        parent: null,
    },
    {
        ID: "buurtstallingen",
        Name: "Buurtstallingen",
        parent: null,
    },
    {
        ID: "fietsenwin",
        Name: "Fiets en Win",
        parent: "fms",
    },
    {
        ID: "fietskluizen",
        Name: "Fietskluizen",
        parent: null,
    },
    {
        ID: "fms",
        Name: "FMS",
        parent: null,
    },
    {
        ID: "veiligstallen",
        Name: "VeiligStallen",
        parent: null,
    },
  ]
