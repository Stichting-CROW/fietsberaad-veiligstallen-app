function dateLabel(date: Date): string {
  return date.toLocaleDateString("nl-NL");
}

export function reservationMail(input: {
  urlName: string;
  stallingType: string;
  stallingTitle: string;
  expiry: Date;
  contractUrl: string;
  machtigingUrl: string;
}): string {
  const expiry = dateLabel(input.expiry);
  const place = `${input.stallingType} ${input.stallingTitle}`;
  if (input.urlName === "utrecht" || input.urlName === "testgemeente") {
    return `<p>Er is een plek voor u gereserveerd in ${place}.</p>
<p>Om de reservering definitief te maken moet u de sleutel voor ${expiry} ophalen bij de beheerder.</p>
<p>Onderstaand de locaties, waar de sleutel en penning afgehaald kunnen worden.</p>
<p style="color:#d11f3d;font-weight:bold;">Tijdens kantoortijden</p>
<p style="font-weight:bold;">U-Stal<br/>Floridadreef 112<br/>Utrecht</p>
<p style="font-weight:bold;">De sleutel kan alleen worden opgehaald op maandag tot en met vrijdag van 09:00 t/m 17:00.<br/>(Zaterdag en zondag zijn wij gesloten)</p>
<p>Deze sleutel ligt <strong>na twee volledige werkdagen</strong> voor u klaar op de receptie bij U-stal. De twee werkdagen dienen gerekend te worden vanaf dagtekening van deze mail.</p>
<p>Mocht u de sleutel eerder willen ophalen, kunt u telefonisch contact met U-Stal opnemen.</p>
<p style="color:#d11f3d;font-weight:bold;">Op afspraak</p>
<p style="font-weight:bold;">Fietsenstalling Laag Catharijne<br/>Catharijnesingel 28<br/>Utrecht</p>
<p>De sleutel kan uitsluitend opgehaald worden op afspraak, dit kan per mail of telefonisch. De afspraak dient u de dag voorafgaand aan de ophaaldag voor 16.00 te maken.</p>
<p>Ophaaldagen:<br/>Dinsdagochtend tussen 11:00 en 13:00<br/>Donderdagavond tussen 17:00 en 19:00</p>
<p>We vragen u onderstaande documenten in te vullen en samen met een ID-bewijs mee te nemen bij het ophalen van uw sleutel.</p>
<ul><li><a href="${input.contractUrl}">Contract</a></li><li><a href="${input.machtigingUrl}">Machtiging</a></li></ul>
<p>Haalt u de sleutel niet op tijd op, dan komt de reservering te vervallen en wordt u verwijderd van de wachtlijst.</p>
<p>Heeft u vragen of wilt u een afspraak maken? Neem dan contact op met de beheerder via veiligstallen@u-stal.nl of 030-2734450.</p>`;
  }
  if (input.urlName === "delft") {
    return `<p>Er is een plek voor u gereserveerd in ${place}. Om de reservering definitief te maken moet u de sleutel uiterlijk op ${expiry} ophalen bij de beheerder.</p>
<p><b>U dient <span style="text-decoration:underline;">vooraf</span> onderstaand document in te vullen en dit formulier samen met een ID-bewijs mee te nemen bij het ophalen van uw sleutel.</b></p>
<ul><li><a href="${input.contractUrl}">Contract</a></li></ul>
<p>Onderstaand de locatie, waar de sleutel en penning afgehaald kunnen worden.</p>
<p>Stalling Vesteplein<br/>Vesteplein 32<br/>2611 WG Delft</p>
<p>De sleutel kan alleen worden opgehaald tijdens de openingstijden van de locatie:</p>
<p>maandag: 10.30 - 01.00 uur<br/>dinsdag t/m zaterdag: 08.30 - 01.00 uur<br/>zondag: 11.30 - 17.30 uur</p>
<p>Deze sleutel ligt klaar <b>twee volledige werkdagen</b> na de datum van deze bevestigingsmail. Mocht u de sleutel eerder willen ophalen, of heeft u andere vragen, dan kunt u tijdens kantooruren (09.00 tot 17.00) contact met U-Stal opnemen via 030-2734450. Indien u per e-mail met ons contact wilt opnemen dan kunt u mailen naar: veiligstallen@u-stal.nl.</p>
<p>Haalt u de sleutel niet binnen 2 weken na de datum van deze mail op, dan komt uw reservering te vervallen. U wordt dan achteraan op de wachtlijst geplaatst.</p>`;
  }
  return `<p>Er is een plek voor u gereserveerd in ${place}.</p>
<p>Haal de sleutel op voor ${expiry}. Neem het contract, het machtigingsformulier en een identiteitsbewijs mee.</p>
<ul><li><a href="${input.contractUrl}">Contract</a></li><li><a href="${input.machtigingUrl}">Machtiging</a></li></ul>`;
}

export function terminationMail(input: { urlName: string; stallingType: string; stallingTitle: string; cancelledOn: Date }): string {
  const when = dateLabel(input.cancelledOn);
  const place = `${input.stallingType} ${input.stallingTitle}`;
  if (input.urlName === "utrecht") {
    return `<p>Uw reservering voor ${place} is op ${when} opgezegd.</p>
<p>Wij verzoeken u de sleutel binnen een week in te leveren bij de beheerder: <b>U-Stal Floridadreef 112 Utrecht</b></p>
<p style="font-weight:bold;">De sleutel kan alleen worden ingeleverd op maandag tot en met vrijdag van 09:00 t/m 17:00.<br/>(Zaterdag en zondag zijn wij gesloten)</p>
<p>Heeft u vragen? Neem dan contact op met de beheerder via veiligstallen@u-stal.nl</p>`;
  }
  if (input.urlName === "delft" || input.urlName === "testgemeente") {
    return `<p>Uw reservering voor ${place} is op ${when} opgezegd.</p>
<p>Wij verzoeken u de sleutel binnen een week in te leveren bij de beheerder:</p>
<p style="font-weight:bold;">Stalling Vesteplein<br/>Vesteplein 32<br/>2611 WG Delft</p>
<p style="font-weight:bold;">maandag: 10.30 - 01.00 uur<br/>dinsdag t/m zaterdag: 08.30 - 01.00 uur<br/>zondag: 11.30 - 17.30 uur</p>
<p>Heeft u vragen? Neem dan contact op met de beheerder via veiligstallen@u-stal.nl</p>`;
  }
  return `<p>Uw abonnement voor ${place} is op ${when} opgezegd. Lever de sleutel binnen een week in bij de beheerder.</p>`;
}

export function declinedMail(stallingTitle: string): string {
  return `<p>U heeft het aanbod voor een plek in ${stallingTitle} afgewezen. De plek wordt aangeboden aan de volgende persoon op de wachtlijst.</p>`;
}

export function expiredMail(stallingTitle: string, expiry: Date): string {
  return `<p>Uw reservering voor ${stallingTitle} is op ${dateLabel(expiry)} verlopen. De plek is weer vrijgegeven.</p>`;
}

export function stillInterestedMail(stallingTitle: string): string {
  return `<p>U heeft elders een plek gereserveerd. Heeft u nog steeds interesse in ${stallingTitle}? U blijft op die wachtlijst staan tot u zich afmeldt.</p>`;
}

export function waitingListMail(input: {
  stallingType: string;
  stallingTitle: string;
  bikeType: string;
  sequence: number;
  preference: string;
  leaveUrl: string;
}): string {
  const preference = input.preference === "UNDER"
    ? " Uw voorkeur is een plek in het onderrek."
    : input.preference === "ABOVE"
      ? " Uw voorkeur is een plek in het bovenrek."
      : "";
  return `<p>U bent op ${dateLabel(new Date())} aan de wachtlijst toegevoegd voor een ${input.bikeType} in ${input.stallingType} ${input.stallingTitle}.${preference}</p>
<p>Momenteel staat u op plaats ${input.sequence} van de wachtlijst. U krijgt van ons bericht als er een plaats voor u beschikbaar komt.</p>
<p>Als u van de wachtlijst af wilt, gebruikt u <a href="${input.leaveUrl}">deze link</a>.</p>`;
}
