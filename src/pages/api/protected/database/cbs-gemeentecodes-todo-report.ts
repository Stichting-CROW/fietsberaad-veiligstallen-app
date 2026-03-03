import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { userHasRight } from '~/types/utils';
import { VSSecurityTopic } from '~/types/securityprofile';
import {
  getCBSGemeentecodesData,
  type CBSGemeentecodeType,
} from './cbs-gemeentecodes';

type TodoAction =
  | 'CODE_VERWIJDEREN'
  | 'TOEVOEGEN'
  | 'NAAM_WIJKT_AF'
  | 'VERKEERDE_CODE'
  | 'NAAM_NIET_IN_CBS';

type TodoRow = {
  actie: TodoAction;
  contact_id: string;
  veiligstallen_naam: string;
  veiligstallen_code: string;
  cbs_naam: string;
  cbs_code: string;
  opmerking: string;
};

function escapeCsv(value: string): string {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getCurrentCode(gemeente: CBSGemeentecodeType): string {
  if (gemeente.history.length === 0) return '-';
  const sorted = [...gemeente.history].sort(
    (a, b) => parseInt(b.lastyear) - parseInt(a.lastyear)
  );
  return sorted[0]?.cbscode ?? '-';
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^gemeente\s+/i, '')
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: 'Niet ingelogd' });
    return;
  }

  const hasFietsberaadAdmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_admin
  );
  const hasFietsberaadSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );

  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    res.status(403).json({ error: 'Geen toegang' });
    return;
  }

  try {
    const { contacts, cbs_gemeentecodes } = await getCBSGemeentecodesData();

    // Only organizations use CBS codes; exploitants and dataproviders do not
    const organizationContacts = contacts.filter(
      (c) => c.itemtype === 'organizations'
    );

    const veiligstallenNames = new Set(
      organizationContacts.map((c) => c.companyname.toLowerCase())
    );
    // Codes already in use by Veiligstallen (exclude from ADD - those are NAAM_WIJKT_AF)
    const veiligstallenCodesInUse = new Set(
      organizationContacts
        .map((c) => c.veiligstallen_gemeentecode?.padStart(4, '0'))
        .filter((code): code is string => !!code)
    );
    const cbsByName = new Map(
      cbs_gemeentecodes.map((g) => [g.name.toLowerCase(), g])
    );
    const cbsByCode = new Map<string, CBSGemeentecodeType>();
    for (const g of cbs_gemeentecodes) {
      const code = getCurrentCode(g);
      if (code !== '-') {
        cbsByCode.set(code.padStart(4, '0'), g);
      }
    }

    const rows: TodoRow[] = [];

    // 1. CODE_VERWIJDEREN: Veiligstallen heeft code maar gemeente bestaat niet meer (opgeheven)
    for (const contact of organizationContacts) {
      if (!contact.veiligstallen_gemeentecode) continue;
      const cbsByNameMatch = cbsByName.get(contact.companyname.toLowerCase());
      if (cbsByNameMatch) {
        const currentCode = getCurrentCode(cbsByNameMatch);
        if (currentCode === '-') {
          rows.push({
            actie: 'CODE_VERWIJDEREN',
            contact_id: contact.id,
            veiligstallen_naam: contact.companyname,
            veiligstallen_code: contact.veiligstallen_gemeentecode,
            cbs_naam: cbsByNameMatch.name,
            cbs_code: '-',
            opmerking: 'Gemeente opgeheven, verwijder CBS code',
          });
        }
      }
    }

    // 2. TOEVOEGEN: CBS gemeente bestaat maar geen Veiligstallen organisatie
    // Exclude codes already in use (those are NAAM_WIJKT_AF, not TOEVOEGEN)
    for (const cbs of cbs_gemeentecodes) {
      const currentCode = getCurrentCode(cbs);
      if (currentCode === '-') continue;
      const paddedCode = currentCode.padStart(4, '0');
      if (
        !veiligstallenNames.has(cbs.name.toLowerCase()) &&
        !veiligstallenCodesInUse.has(paddedCode)
      ) {
        rows.push({
          actie: 'TOEVOEGEN',
          contact_id: '',
          veiligstallen_naam: '',
          veiligstallen_code: '',
          cbs_naam: cbs.name,
          cbs_code: paddedCode,
          opmerking: 'Toevoegen aan Veiligstallen',
        });
      }
    }

    // 3. NAAM_WIJKT_AF: Zelfde code maar andere naam
    // 4. VERKEERDE_CODE: Naam bestaat in CBS maar code is fout
    // 5. NAAM_NIET_IN_CBS: Naam komt niet voor in CBS
    for (const contact of organizationContacts) {
      const cbsByNameMatch = cbsByName.get(contact.companyname.toLowerCase());
      const code = contact.veiligstallen_gemeentecode;
      const cbsByCodeMatch = code
        ? cbsByCode.get(code.padStart(4, '0'))
        : undefined;

      if (!cbsByNameMatch) {
        if (code && cbsByCodeMatch) {
          rows.push({
            actie: 'NAAM_WIJKT_AF',
            contact_id: contact.id,
            veiligstallen_naam: contact.companyname,
            veiligstallen_code: code,
            cbs_naam: cbsByCodeMatch.name,
            cbs_code: getCurrentCode(cbsByCodeMatch).padStart(4, '0'),
            opmerking: `Naam wijkt af: "${contact.companyname}" vs CBS "${cbsByCodeMatch.name}"`,
          });
        } else {
          rows.push({
            actie: 'NAAM_NIET_IN_CBS',
            contact_id: contact.id,
            veiligstallen_naam: contact.companyname,
            veiligstallen_code: code || '',
            cbs_naam: '',
            cbs_code: '',
            opmerking: 'Naam komt niet voor in CBS',
          });
        }
      } else {
        const correctCode = getCurrentCode(cbsByNameMatch);
        if (correctCode !== '-' && code !== correctCode.padStart(4, '0')) {
          if (!namesMatch(contact.companyname, cbsByNameMatch.name)) {
            rows.push({
              actie: 'NAAM_WIJKT_AF',
              contact_id: contact.id,
              veiligstallen_naam: contact.companyname,
              veiligstallen_code: code || '',
              cbs_naam: cbsByNameMatch.name,
              cbs_code: correctCode.padStart(4, '0'),
              opmerking: 'Naam wijkt af, code mogelijk ook',
            });
          } else {
            rows.push({
              actie: 'VERKEERDE_CODE',
              contact_id: contact.id,
              veiligstallen_naam: contact.companyname,
              veiligstallen_code: code || '',
              cbs_naam: cbsByNameMatch.name,
              cbs_code: correctCode.padStart(4, '0'),
              opmerking: `Verkeerde code: ${code || '(leeg)'} i.p.v. ${correctCode.padStart(4, '0')}`,
            });
          }
        }
      }
    }

    // Sorteer: CODE_VERWIJDEREN, VERKEERDE_CODE, NAAM_WIJKT_AF, TOEVOEGEN, NAAM_NIET_IN_CBS
    const order: Record<TodoAction, number> = {
      CODE_VERWIJDEREN: 0,
      VERKEERDE_CODE: 1,
      NAAM_WIJKT_AF: 2,
      TOEVOEGEN: 3,
      NAAM_NIET_IN_CBS: 4,
    };
    rows.sort((a, b) => order[a.actie] - order[b.actie]);

    const headers = [
      'actie',
      'contact_id',
      'veiligstallen_naam',
      'veiligstallen_code',
      'cbs_naam',
      'cbs_code',
      'opmerking',
    ] as const;
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => escapeCsv((r as Record<string, string>)[h])).join(',')
      ),
    ];
    const csv = csvLines.join('\n');

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `cbs-todo-${dateStr}-${timeStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send('\uFEFF' + csv);
  } catch (error) {
    console.error('Error generating CBS TODO report:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Onbekende fout',
    });
  }
}
