# Documentation of Datastandard REST API (V2) #

## API Overview ##

The Datastandard REST API exposes resources for organisations, surveys, survey areas, parking locations, sections, canonical vehicle categories/vehicles, and observations. Most write operations require authentication and specific roles.

Base: `/v2`

| Resource | Methods | Paths (relative to /v2) | Notes |
|----------|---------|--------------------------|-------|
| Auth/Permissions | GET | `/auth`, `/permissions` | Returns permissions for current user |
| Organisations | GET, POST(403), DELETE(403) | `/organisations`, `/organisations/{organisationid}` | Read-only for now |
| Surveys | GET, GET by id, POST, PUT, DELETE | `/surveys`, `/surveys/{surveyId}` | Create/update/delete require auth + roles |
| Survey Areas | GET (list/by survey), POST, PUT, DELETE | `/survey-areas`, `/surveys/{surveyId}/survey-areas`, `/surveys/{surveyId}/survey-areas/{surveyAreaId}` | Manage survey areas |
| Parking Locations | GET (list/by survey area), GET by id, POST, PUT, DELETE | `/parking-locations`, `/parking-locations/{id}`, `/surveys/{surveyId}/parking-locations/` | Manage parking locations |
| Sections | GET (list), GET by id, POST, PUT, DELETE | `/sections`, `/sections/{sectionid}` | Manage sections |
| Canonical Vehicle Categories | GET list/by id, POST, DELETE | `/canonical-vehicle-categories`, `/canonical-vehicle-categories/{id}` | Manage categories |
| Canonical Vehicles | GET list/by id, POST, PUT, DELETE | `/canonical-vehicle-categories/{categoryId}/canonical-vehicles`, `/canonical-vehicle-categories/{categoryId}/canonical-vehicles/{canonicalVehicleCode}` | Manage vehicles |
| Observations | GET list, GET by id, POST, DELETE(all) | `/observations`, `/observations/{id}` | Create observations requires auth + role |

## Authentication & Authorization ##

- Authentication: HTTP Basic Authentication
- Authorization:
  - Read: generally allowed for authenticated users; some endpoints read without explicit auth branch
  - Write (POST/PUT/DELETE): requires either `dataprovider` role or `admin` (checked in `canWrite()`)
- Endpoints return 401 with `WWW-Authenticate: Basic realm="FMSService"` when not authenticated

## API methods ##

### Auth
- getAuth
  - GET `/v2/auth`
  - Returns: permissions from gateway
- getPermissions
  - GET `/v2/permissions`

### Organisations
- getOrganisations
  - GET `/v2/organisations`
  - Query: `orderBy?`, `orderDirection?`, `offset?`, `limit?`
- getOrganisation
  - GET `/v2/organisations/{organisationid}`
- postOrganisation, deleteOrganisation
  - POST `/v2/organisations` (403), DELETE `/v2/organisations/{organisationid}` (403)

### Surveys
- getSurveys
  - GET `/v2/surveys`
  - Query: `surveyId?`, `authority?`, `geopolygon?`, `georelation?`, `offset?`, `limit?`, `orderBy?`, `orderDirection?`
- getSurvey
  - GET `/v2/surveys/{surveyId}`
- postSurvey
  - POST `/v2/surveys`
  - Body: `survey: struct`
  - Requires auth + write role
- putSurvey
  - PUT `/v2/surveys/{surveyId}`
  - Body: `survey: struct`
  - Requires auth + write role
- deleteSurvey
  - DELETE `/v2/surveys/{surveyId}`
  - Requires auth + write role

### Survey Areas
- getSurveyAreas
  - GET `/v2/survey-areas`
  - Query: `localId?`, `authority?`, `geopolygon?`, `georelation?`, `surveyAreaType?`, `validAt?`, `offset?`, `limit?`, `orderBy?`, `orderDirection?`
- getSurveyAreasForSurvey
  - GET `/v2/surveys/{surveyId}/survey-areas`
- postSurveyAreasForSurveyId
  - POST `/v2/surveys/{surveyId}/survey-areas`
  - Body: `surveyAreas: array`
  - Requires auth + write role
- putSurveyAreasForSurveyId
  - PUT `/v2/surveys/{surveyId}/survey-areas`
  - Body: `surveyAreas: array`
  - Requires auth + write role
- deleteSurveyAreaForSurveyId
  - DELETE `/v2/surveys/{surveyId}/survey-areas/{surveyAreaId}`
  - Requires auth + write role
- deleteAllSurveyAreas
  - DELETE `/v2/survey-areas` (403 on live servers)
  - Requires auth + write role
- getSurveyArea
  - GET `/v2/survey-areas/{surveyareaId}`
- getSurveyAreaLocations
  - GET `/v2/surveys/{surveyId}/survey-areas/{surveyareaId}/parking-locations/`
- getSurveyAreaSections
  - GET `/v2/surveys/{surveyId}/survey-areas/{surveyareaId}/sections/`

### Parking Locations
- getLocations
  - GET `/v2/parking-locations`
  - Query: `localId?`, `authority?`, `geopolygon?`, `georelation?`, `validAt?`, `offset?`, `limit?`, `orderBy?`, `orderDirection?`
- getLocation
  - GET `/v2/parking-locations/{id}`
- postLocation
  - POST `/v2/parking-locations`
  - Body: `locations: struct`
  - Requires auth + write role
- putLocation
  - PUT `/v2/parking-locations/{locationid}`
  - Body: `location: struct`
  - Requires auth + write role
- deleteLocation
  - DELETE `/v2/parking-locations/{id}`
  - Requires auth + write role
- deleteAllLocations
  - DELETE `/v2/parking-locations` (403 on live servers)
  - Requires auth + write role

### Sections
- getSections
  - GET `/v2/sections`
  - Query: `localId?`, `authority?`, `surveyId?`, `contractor?`, `validAt?`, `offset?`, `limit?`, `orderBy?`, `orderDirection?`
- getSection
  - GET `/v2/sections/{sectionid}`
- postSection
  - POST `/v2/sections`
  - Body: `section: struct`
  - Requires auth + write role
- putSection
  - PUT `/v2/sections/{sectionid}`
  - Body: `section: struct`
  - Requires auth + write role
- deleteSection
  - DELETE `/v2/sections/{id}`
  - Requires auth + write role
- deleteAllSections
  - DELETE `/v2/sections` (403 on live servers)
  - Requires auth + write role

### Canonical Vehicle Categories & Vehicles
- postCanonicalVehicleCategory
  - POST `/v2/canonical-vehicle-categories`
  - Body: `canonicalVehicleCategory: struct` (auth + write)
- getCanonicalVehicleCategories
  - GET `/v2/canonical-vehicle-categories`
- getCanonicalVehicleCategory
  - GET `/v2/canonical-vehicle-categories/{id}`
- deleteCanonicalVehicleCategory(s)
  - DELETE `/v2/canonical-vehicle-categories/{id}` (auth + write)
  - DELETE `/v2/canonical-vehicle-categories` (auth + write)
- postCanonicalVehicle
  - POST `/v2/canonical-vehicle-categories/{canonicalVehicleCategoryId}/canonical-vehicles` (auth + write)
- putCanonicalVehicle
  - PUT `/v2/canonical-vehicle-categories/{categoryId}/canonical-vehicles/{canonicalVehicleCode}` (auth + write)
- getCanonicalVehicles
  - GET `/v2/canonical-vehicle-categories/{categoryId}/canonical-vehicles/`
- getCanonicalVehicle
  - GET `/v2/canonical-vehicle-categories/{canonicalVehicleCategoryId}/canonical-vehicles/{canonicalVehicleCode}`
- deleteCanonicalVehicle(s)
  - DELETE `/v2/canonical-vehicle-categories/{canonicalVehicleCategoryId}/canonical-vehicles/{canonicalVehicleCode}` (auth + write)
  - DELETE `/v2/canonical-vehicle` (auth + write)

### Observations
- getObservations
  - GET `/v2/observations` (auth required)
- getObservation
  - GET `/v2/observations/{id}`
- postObservation
  - POST `/v2/observations` (auth + write)
  - Body: `observation: struct`
- deleteAllObservations
  - DELETE `/v2/observations` (403 on live servers)
  - Requires auth + write role

## Internal structure ##

- Component: `broncode/remote/REST/api/v2.0.datastandaard.cfc` (REST, `restpath=/v2`)
- Gateway: `nl.fietsberaad.datastandaard.persistence.DatastandaardGateway` implements the business logic and error generation
- Auth helpers:
  - `authenticate()`: returns 401 for guest
  - `canWrite()`: allows `dataprovider` or `admin`
- Default page sizes: dynamic/static lists default to 10,000 unless overridden
- Error handling: `gateway.generateError(cfcatch[, status])`

## Notes ##

- Many writes return 403 on live servers for destructive all-delete endpoints
- Query parameters often include paging (`offset`, `limit`) and sorting (`orderBy`, `orderDirection`)
- Some endpoints add `authuser` to arguments to scope results by the current user

