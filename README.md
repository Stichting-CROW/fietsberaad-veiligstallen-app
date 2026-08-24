# VeiligStallen frontend app

This is the code repository of the VeiligStallen frontend app. The codebase uses NextJS and is written in JavaScript (React).

## URLs of app online

- Acceptance: https://vstfb-eu-acc-app01.azurewebsites.net
- Production: https://beta.veiligstallen.nl

## First time setup

### Install dependencies

Run: `npm install`

### Configure .env file

Fill in database credentials in the .env file:

DATABASE_URL=mysql://UNAME:PASSWD@127.0.0.1:5555/veiligstallen

Fill in a Mapbox key in the .env.local file.

### Create key for nextauth

In your terminal, run:

    openssl rand -base64 32

Add the key in `.env`, as value for `NEXTAUTH_SECRET`

## Running the app

Make sure that a connection to the database is available (by opening an ssh tunnel to the development database server @veiligstallen.work):

     ./scripts/launch-ssh-tunnel.sh

For development purposes:

    npm run dev

## Deploying the app

TODO Document new deployment process

The app is deployed to a test server at the moment: https://beta.veiligstallen.nl/

Deploy a new version using these commands:

    ssh parkman@beta.veiligstallen.nl
    ./deploy.sh

Deployment is configured like this:

- Op de testserver wordt een pull van de repository gedaan, daarna een npm build
- De app wordt gedraaid met de pm2 taakmanager

^ DIT IS OUDE INFORMATIE - DEPLOYMENT VINDT AUTOMATISCH PLAATS VIA GITLAB CI/CD PIPELINES (ACTIONS)

## Exporting postgresql table as MySQL compatible statements

    pg_dump -h localhost -U deelfietsdashboard -d deelfietsdashboard -t zones --port 5431 --format=c --inserts > zones.sql

## Using Dashboard Deelmobiliteit API call for getting municipality

Get municipality based on latitude/longitude:

    https://api.dashboarddeelmobiliteit.nl/dashboard-api/public/get_municipality_based_on_latlng?location=52.0,4.5

Error response:

    https://api.dashboarddeelmobiliteit.nl/dashboard-api/public/get_municipality_based_on_latlng?location=52.0,7.5

## Create a docker image for the veiligstallen application

- make sure that your .env file containers the settings that should be used server side (your development settings can be set in .env.local: this overrides the .env settings)
- first make sure that the prisma binaries have been generated (npx prisma generate)
- next create the docker container using the `npm run docker-build` command
- the docker image can be started locally by running `npm run docker-run`

--

Stap van schema-full.prisma is auto generated.
schema.prisma is de uitgeklede versie en moet je handmatig aanpassen bij updates in het schema

NOTE: Na elke `npm run setup-db` moet schema.prisma worden gerevert.

`npx prisma generate` daarna: dat maakt de classes in de app op basis van het schema.

(als ik geen setup-db meer doet, blijft alles hetzelfde)

--

Als na pull er prisma errors zijn, dan doe:
- npx prisma generate
- npm i


# data exploration paginas

Deze paginas kunnen worden gebruikt voor het bekijken van gebruiksdata/organisatie data
- http://localhost:3000/beheer/exploreexploitanten
- http://localhost:3000/beheer/exploregemeenten
- http://localhost:3000/beheer/exploreusers

# various
- in development mode: klik op de gebruikersnaam om de sessie info te tonen in het console log

# wijzigen database password voor gebruiker veiligstallen_readwrite
- verbind via ssh met veiligstallen@veiligstallen.work
- sudo mysql
```
ALTER USER 'veiligstallen_readwrite'@'127.0.0.1' IDENTIFIED BY 'new password';
FLUSH PRIVILEGES;
```

nieuw wachtwoord aanmaken bv met openssl rand -base64 32
