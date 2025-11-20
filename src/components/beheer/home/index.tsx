import React from 'react';
import { FiMail } from 'react-icons/fi';

interface HomeInfoComponentProps {
   gemeentenaam: string | undefined;
}

const HomeInfoComponent: React.FC<HomeInfoComponentProps> = ({ gemeentenaam }) => {

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white/95 p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
            Welkom
          </span>
          <h1 className="text-3xl font-semibold leading-tight text-slate-900">
            Beheeromgeving VeiligStallen{gemeentenaam ? ` (${gemeentenaam})` : ""}
          </h1>
        </div>

        <div className="space-y-4 text-base leading-6 text-slate-600">
          <p>
            Dit dashboard geeft je toegang tot alle beheerfunctionaliteiten van VeiligStallen.
            Hier vind je de rapportagetool en kun je snel schakelen tussen onderdelen zoals gebruikers,
            fietsenstallingen en contentbeheer.
          </p>
          <p>
            Gebruik het menu aan de linkerkant om direct naar een onderdeel te navigeren. De
            rapportages worden automatisch bijgewerkt, zodat je altijd beschikt over de meest recente
            inzichten.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Feedback of vragen?</span>
          <a
            href="mailto:info@veiligstallen.nl"
            className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
          >
            <FiMail className="h-4 w-4" />
            Mail ons op info@veiligstallen.nl
          </a>
        </div>
      </section>
    </div>
  );
};

export default HomeInfoComponent;
