import React from 'react';
import { VSContactGemeente } from '~/types/contacts';

interface HomeInfoComponentProps {
   gemeentenaam: string | undefined;
}

const HomeInfoComponent: React.FC<HomeInfoComponentProps> = ({ gemeentenaam }) => {

  return (
    <div className="p-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Welkom</h2>

        <p className="text-gray-600 mb-4">
          Welkom in de beheeromgeving van VeiligStallen{gemeentenaam ? ` (${gemeentenaam})` : "!"}
        </p>

        <p className="text-gray-600 mb-4">
          Via deze omgeving kun je rapportages inzien via de nieuwe rapportage-tool van VeiligStallen.
        </p>

        <p className="text-gray-600 mb-4">
          Heb je feedback? Stuur dan een e-mail aan <a href="mailto:info@veiligstallen.nl" className="underline">info@veiligstallen.nl</a>.
        </p>

        {/* <p className="text-gray-600 mb-4">
          Welkom in de beheeromgeving van Veiligstallen{gemeentenaam ? ` (${gemeentenaam})` : ""}. Via deze omgeving kunt u de volgende onderdelen beheren:
        </p>
        
        <ul className="list-disc list-inside text-gray-600 space-y-2 ml-4">
          <li>Gebruikers en toegangsrechten</li>
          <li>Gemeenten en contactpersonen</li>
          <li>Exploitanten en contactpersonen</li>
          <li>Dataproviders</li>
          <li>Pagina's en artikelen</li>
          <li>Fietsenstallingen</li>
        </ul>

        <p className="text-gray-600 mt-6">
          Gebruik het menu aan de linkerkant om naar de verschillende onderdelen te navigeren.
        </p> */}
      </div>
    </div>
  );
};

export default HomeInfoComponent;
