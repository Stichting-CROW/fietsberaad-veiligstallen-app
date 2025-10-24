# Documentation of Coldfusion API services #

## API V1 services ##

### authentication ###

V1 API uses HTTP Basic Authentication implemented in `Application.cfc`. Authentication is required for all endpoints.

**Authentication Process:**
- Credentials validated against `fmsservice_permit` and `contacts` tables
- Users must have specific permits: `operator`, `dataprovider.type1`, or `dataprovider.type2`
- Admin user (`urlName = 'admin'`) has access to all endpoints
- Authentication failure returns HTTP 401 with WWW-Authenticate header

**User Roles:**
- `operator`: Basic access to bikepark operations
- `dataprovider.type1`: Data provider access level 1
- `dataprovider.type2`: Data provider access level 2 (includes occupation reporting)
- `admin`: Full administrative access

### API methods ###

#### Bike Management Methods

**getBikeUpdates** *(DEPRECATED)*
- **Description**: Get bike updates since given date (use getJsonBikeUpdates instead)
- **Database Tables**: `transacties`, `accounts_pasIDs`, `gemeenteaccounts`, `accounts`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Status**: DEPRECATED

**getJsonBikeUpdates**
- **Description**: Get bike updates since given date in JSON format. Returns array of bikes that changed in the municipality since given date (checkins, checkouts, bike reconnections, new/expired subscriptions, payments)
- **Database Tables**: `transacties`, `accounts_pasIDs`, `gemeenteaccounts`, `accounts`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

**saveJsonBike**
- **Description**: Link barcode bike to barcode key fob and optionally to RFID and RFIDBike
- **Database Tables**: `wachtrij_pasids`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**saveJsonBikes**
- **Description**: Bulk save bike-pass associations
- **Database Tables**: `wachtrij_pasids`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**getBikeType** *(DEPRECATED)*
- **Description**: Get bike type details by BikeTypeID (use getJsonBikeType instead)
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Status**: DEPRECATED

**getJsonBikeType**
- **Description**: Get bike type details by BikeTypeID in JSON format
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

**getJsonBikeTypes**
- **Description**: Get all bike types in JSON format
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

#### Section/Sector Methods

**getSections** *(DEPRECATED)*
- **Description**: Get bikepark sections properties (use getJsonSectors instead)
- **Database Tables**: `fietsenstallingen`, `fietsenstalling_sectie`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Status**: DEPRECATED

**getJsonSectors**
- **Description**: Get bikepark sectors properties: name, capacity, rates, and maximum parking time
- **Database Tables**: `fietsenstallingen`, `fietsenstalling_sectie`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

#### Financial/Saldo Methods

**addJsonSaldo**
- **Description**: Add balance to account
- **Database Tables**: `wachtrij_betalingen` (via application.service.addSaldoUpdateToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**addJsonSaldos**
- **Description**: Bulk add balance to accounts
- **Database Tables**: `wachtrij_betalingen` (via application.service.addSaldoUpdateToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**getJsonPaymentTypes**
- **Description**: Get available payment types for use in addSaldo and addJsonSaldos
- **Database Tables**: None (hardcoded values)
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

#### Transaction Methods

**uploadJsonTransaction**
- **Description**: Upload single check-in/check-out transaction
- **Database Tables**: `wachtrij_transacties` (via addTransactionToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**uploadJsonTransactions**
- **Description**: Bulk upload check-in/check-out transactions
- **Database Tables**: `wachtrij_transacties` (via addTransactionToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

#### Subscription Methods

**addSubscription**
- **Description**: Add new subscription purchased at bikepark
- **Database Tables**: `abonnementen`, `financialtransactions`, `accounts`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**subscribe**
- **Description**: Link key fob to subscription
- **Database Tables**: `abonnementen`, `accounts_pasIDs`, `accounts`
- **Access Pattern**: rw (read-write)
- **Access Restrictions**: `operator` permit required

**getJsonSubscriptionTypes**
- **Description**: Get subscription types available for given bikepark
- **Database Tables**: `abonnementsvormen`, `abonnementsvorm_fietsenstalling`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

#### Client/User Type Methods

**getJsonClientTypes**
- **Description**: Get all existing client types for use in objects requiring clientTypeID
- **Database Tables**: `klanttypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

#### Occupation Reporting

**reportJsonOccupationData**
- **Description**: Report bikepark occupation data
- **Database Tables**: `bezettingsdata`, `fietsenstalling_sectie`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` or `dataprovider.type2` permit required

#### Synchronization

**syncSector**
- **Description**: Synchronize sector database with central server. Bikes in central DB not in provided array are checked out, bikes in provided array not in central DB are checked in
- **Database Tables**: `wachtrij_sync`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

#### Locker Management

**getLockerInfo**
- **Description**: Get locker information including status, master keys, and max parking time
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasIDs`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

**setUrlWebserviceForLocker**
- **Description**: Set callback URL for locker to refresh data when changes occur in web environment
- **Database Tables**: `fietsenstalling_plek`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

#### Utility Methods

**getServerTime**
- **Description**: Get server timestamp
- **Database Tables**: None
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

## API V2 services ##

### authentication ###

V2 API uses the same HTTP Basic Authentication as V1, implemented in `Application.cfc`. Authentication is required for all endpoints.

**Authentication Process:**
- Credentials validated against `fmsservice_permit` and `contacts` tables
- Users must have specific permits: `operator`, `dataprovider.type1`, or `dataprovider.type2`
- Admin user (`urlName = 'admin'`) has access to all endpoints
- Authentication failure returns HTTP 401 with WWW-Authenticate header

**User Roles:**
- `operator`: Basic access to bikepark operations
- `dataprovider.type1`: Data provider access level 1
- `dataprovider.type2`: Data provider access level 2 (includes occupation reporting)
- `admin`: Full administrative access

**V2 Enhancements:**
- JSON-only format (no legacy formats)
- Better error handling with JSON error responses
- Support for flexible date formats (ISO 8601 and custom formats)
- Also available as REST service at `https://remote.veiligstallen.nl/v2/REST/<method>/<bikeparkID>/<sectorID>`

### API methods ###

#### Bike Management Methods

**getJsonBikeUpdates**
- **Description**: Get bike updates since given date in JSON format. Returns array of bikes that changed in the municipality since given date (checkins, checkouts, bike reconnections, new/expired subscriptions, payments)
- **Database Tables**: `transacties`, `accounts_pasids`, `gemeenteaccounts`, `accounts`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

**getJsonBikes**
- **Description**: Get all registered bikes in the municipality. Returns array with barcode and bike type ID for each registered bike
- **Database Tables**: `barcoderegister`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

**saveJsonBike**
- **Description**: Link barcode bike to barcode key fob and optionally to RFID and RFIDBike
- **Database Tables**: `wachtrij_pasids`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**saveJsonBikes**
- **Description**: Bulk save bike-pass associations
- **Database Tables**: `wachtrij_pasids`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**getBikeType** *(DEPRECATED)*
- **Description**: Get bike type details by BikeTypeID (use getJsonBikeType instead)
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Status**: DEPRECATED

**getJsonBikeType**
- **Description**: Get bike type details by BikeTypeID in JSON format
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

**getJsonBikeTypes**
- **Description**: Get all bike types in JSON format
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

#### Section/Sector Methods

**getJsonSectors**
- **Description**: Get bikepark sectors properties: name, capacity, rates, and maximum parking time
- **Database Tables**: `fietsenstallingen`, `fietsenstalling_sectie`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

#### Financial/Saldo Methods

**addJsonSaldo**
- **Description**: Add balance to account
- **Database Tables**: `wachtrij_betalingen` (via application.service.addSaldoUpdateToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**addJsonSaldos**
- **Description**: Bulk add balance to accounts
- **Database Tables**: `wachtrij_betalingen` (via application.service.addSaldoUpdateToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**getJsonPaymentTypes**
- **Description**: Get available payment types for use in addSaldo and addJsonSaldos
- **Database Tables**: None (hardcoded values)
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

#### Transaction Methods

**uploadJsonTransaction**
- **Description**: Upload single check-in/check-out transaction
- **Database Tables**: `wachtrij_transacties` (via addTransactionToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**uploadJsonTransactions**
- **Description**: Bulk upload check-in/check-out transactions
- **Database Tables**: `wachtrij_transacties` (via addTransactionToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

#### Subscription Methods

**addSubscription**
- **Description**: Add new subscription purchased at bikepark
- **Database Tables**: `abonnementen`, `financialtransactions`, `accounts`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**subscribe**
- **Description**: Link key fob to subscription
- **Database Tables**: `abonnementen`, `accounts_pasids`, `accounts`
- **Access Pattern**: rw (read-write)
- **Access Restrictions**: `operator` permit required

**getJsonSubscriptionTypes**
- **Description**: Get subscription types available for given bikepark
- **Database Tables**: `abonnementsvormen`, `abonnementsvorm_fietsenstalling`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

**getJsonSubscriptors** *(NEW in V2)*
- **Description**: Get overview of all key fobs with active subscriptions. Returns passID, subscriptionTypeID, and expirationDate for each
- **Database Tables**: `accounts_pasids`, `abonnementen`, `abonnementsvormen`, `abonnementsvorm_fietsenstalling`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

#### Client/User Type Methods

**getJsonClientTypes**
- **Description**: Get all existing client types for use in objects requiring clientTypeID
- **Database Tables**: `klanttypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

#### Occupation Reporting

**reportOccupationData**
- **Description**: Report bikepark occupation data
- **Database Tables**: `bezettingsdata`, `fietsenstalling_sectie`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` or `dataprovider.type2` permit required

#### Synchronization

**syncSector**
- **Description**: Synchronize sector database with central server. Bikes in central DB not in provided array are checked out, bikes in provided array not in central DB are checked in
- **Database Tables**: `wachtrij_sync`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

#### Locker Management

**getLockerInfo**
- **Description**: Get locker information including status, master keys, and max parking time
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasids`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

**setUrlWebserviceForLocker**
- **Description**: Set callback URL for locker to refresh data when changes occur in web environment
- **Database Tables**: `fietsenstalling_plek`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required

**updateLocker** *(NEW in V2)*
- **Description**: Update locker status. Only possible for lockers configured to report their own status. Status codes: 0=free, 1=occupied, 2=blocked, 3=reserved, 4=out of order
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `wachtrij_transacties`, `wachtrij_betalingen`
- **Access Pattern**: rw (read-write)
- **Access Restrictions**: `operator` permit required

**isAllowedToUse** *(NEW in V2)*
- **Description**: Check if an RFID is allowed to use a specific locker or place
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasids`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required

#### Utility Methods

**getServerTime**
- **Description**: Get server timestamp
- **Database Tables**: None
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)

## API V3 services ##

### authentication ###

V3 API uses the same HTTP Basic Authentication as V1 and V2, implemented in `Application.cfc`. Authentication is required for all endpoints.

**Authentication Process:**
- Credentials validated against `fmsservice_permit` and `contacts` tables
- Users must have specific permits: `operator`, `dataprovider.type1`, or `dataprovider.type2`
- Admin user (`urlName = 'admin'`) has access to all endpoints
- Authentication failure returns HTTP 401 with WWW-Authenticate header

**User Roles:**
- `operator`: Basic access to bikepark operations
- `dataprovider.type1`: Data provider access level 1
- `dataprovider.type2`: Data provider access level 2 (includes occupation reporting)
- `admin`: Full administrative access

**V3 Enhancements:**
- **Type-safe API**: Uses proxy objects directly (e.g., `proxy.Bike[]`, `proxy.Transaction`) instead of JSON strings
- **No JSON serialization**: Returns native ColdFusion objects and arrays
- **Cleaner method signatures**: Proper type hints on all parameters and return types
- **Direct validation**: ColdFusion validates types automatically
- **Better IDE support**: Type hints enable better code completion and validation

### API methods ###

#### Bike Management Methods

**getJsonBikeUpdates**
- **Description**: Get bike updates since given date. Returns array of bikes that changed in the municipality since given date (checkins, checkouts, bike reconnections, new/expired subscriptions, payments)
- **Database Tables**: `transacties`, `accounts_pasids`, `gemeenteaccounts`, `accounts`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `array` (native ColdFusion array)

**getBikes**
- **Description**: Get all registered bikes in the municipality. Returns query with barcode and bike type ID for each registered bike
- **Database Tables**: `barcoderegister`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `query` (ColdFusion query object)

**saveBike**
- **Description**: Link barcode bike to barcode key fob and optionally to RFID and RFIDBike
- **Database Tables**: `wachtrij_pasids`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.Bike`
- **Return Type**: `proxy.Result`

**saveBikes**
- **Description**: Bulk save bike-pass associations
- **Database Tables**: `wachtrij_pasids`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.Bike[]`
- **Return Type**: `proxy.Result`

**getBikeType**
- **Description**: Get bike type details by BikeTypeID
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Return Type**: `proxy.BikeType`

**getBikeTypes**
- **Description**: Get all bike types
- **Database Tables**: `fietstypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Return Type**: `proxy.BikeType[]`

#### Section/Sector Methods

**getSectors**
- **Description**: Get bikepark sectors properties: name, capacity, rates, and maximum parking time
- **Database Tables**: `fietsenstallingen`, `fietsenstalling_sectie`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.Sector[]`

#### Financial/Saldo Methods

**addSaldo**
- **Description**: Add balance to account
- **Database Tables**: `wachtrij_betalingen` (via application.service.addSaldoUpdateToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.SaldoAdd`
- **Return Type**: `proxy.AddSaldoResult`

**addSaldos**
- **Description**: Bulk add balance to accounts
- **Database Tables**: `wachtrij_betalingen` (via application.service.addSaldoUpdateToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.SaldoAdd[]`
- **Return Type**: `proxy.Result`

**getPaymentTypes**
- **Description**: Get available payment types for use in addSaldo and addSaldos
- **Database Tables**: None (hardcoded values)
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Return Type**: `proxy.PaymentType[]`

#### Transaction Methods

**uploadTransaction**
- **Description**: Upload single check-in/check-out transaction
- **Database Tables**: `wachtrij_transacties` (via addTransactionToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.Transaction`
- **Return Type**: `proxy.Result`

**uploadTransactions**
- **Description**: Bulk upload check-in/check-out transactions
- **Database Tables**: `wachtrij_transacties` (via addTransactionToWachtrij)
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.Transaction[]`
- **Return Type**: `proxy.Result`

#### Subscription Methods

**addSubscription**
- **Description**: Add new subscription purchased at bikepark
- **Database Tables**: `abonnementen`, `financialtransactions`, `accounts`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.Subscription`
- **Return Type**: `proxy.Result`

**subscribe**
- **Description**: Link key fob to subscription
- **Database Tables**: `abonnementen`, `accounts_pasids`, `accounts`
- **Access Pattern**: rw (read-write)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.Result`

**getSubscriptionTypes**
- **Description**: Get subscription types available for given bikepark
- **Database Tables**: `abonnementsvormen`, `abonnementsvorm_fietsenstalling`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.SubscriptionType[]`

**getSubscriptors**
- **Description**: Get overview of all key fobs with active subscriptions. Returns passID, subscriptionTypeID, and expirationDate for each
- **Database Tables**: `accounts_pasids`, `abonnementen`, `abonnementsvormen`, `abonnementsvorm_fietsenstalling`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `array`

#### Client/User Type Methods

**getClientTypes**
- **Description**: Get all existing client types for use in objects requiring clientTypeID
- **Database Tables**: `klanttypen`
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Return Type**: `proxy.ClientType[]`

#### Synchronization

**syncSector**
- **Description**: Synchronize sector database with central server. Bikes in central DB not in provided array are checked out, bikes in provided array not in central DB are checked in
- **Database Tables**: `wachtrij_sync`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Parameter Type**: `proxy.Bike[]`
- **Return Type**: `proxy.Result`

#### Locker Management

**getLockerInfo**
- **Description**: Get locker information including status, master keys, and max parking time
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasids`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.Locker`

**setUrlWebserviceForLocker**
- **Description**: Set callback URL for locker to refresh data when changes occur in web environment
- **Database Tables**: `fietsenstalling_plek`
- **Access Pattern**: w (write)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.Result`

**updateLocker**
- **Description**: Update locker status. Only possible for lockers configured to report their own status. Status codes: 0=free, 1=occupied, 2=blocked, 3=reserved, 4=out of order
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `wachtrij_transacties`, `wachtrij_betalingen`
- **Access Pattern**: rw (read-write)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.Result`

**isAllowedToUse**
- **Description**: Check if an RFID is allowed to use a specific locker or place
- **Database Tables**: `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasids`
- **Access Pattern**: r (read)
- **Access Restrictions**: `operator` permit required
- **Return Type**: `proxy.RFIDStatus`

#### Utility Methods

**getServerTime**
- **Description**: Get server timestamp
- **Database Tables**: None
- **Access Pattern**: r (read)
- **Access Restrictions**: None (public)
- **Return Type**: `date`


## backend internal structure ## 

### V1 Services Internal Structure

V1 services use the following internal ColdFusion components:

**Core Components:**
- `BaseFMSService.cfc` - Main implementation with all method logic
- `application.service` (bikeparkService) - Business logic service layer
- `application.transactiongateway` - Transaction processing gateway
- `application.baseFMSService` - Base service instance

**Data Transfer Objects:**
- `proxy.Result` - Standard result object
- `proxy.Bike` - Bike data object
- `proxy.Transaction` - Transaction data object
- `proxy.SaldoAdd` - Balance addition object
- `proxy.Sector` - Sector data object
- `proxy.Subscription` - Subscription data object
- `proxy.Locker` - Locker information object

**Database Access:**
- Direct SQL queries for simple operations
- ORM (Object-Relational Mapping) for complex business objects
- Queue-based processing for async operations (`wachtrij_*` tables)

**Authentication Integration:**
- `checkRights()` function validates user permissions
- Integration with `fmsservice_permit` table for granular access control
- Support for both individual bikepark and municipality-wide permissions

### V2 Services Internal Structure

V2 services extend V1 and use the same core architecture with enhancements:

**Core Components:**
- Extends `BaseFMSService.cfc` directly (all V1 logic inherited)
- Uses same `application.service`, `application.transactiongateway`, and `application.baseFMSService`
- Additional utility: `application.helperclass` for date conversion

**Key Differences from V1:**
- All methods serialize results to JSON using `SerializeJSON()`
- All methods deserialize JSON inputs using `DeSerializeJSON()`
- Better error handling with structured JSON error responses
- JSON validation before processing (returns error on invalid JSON)
- Support for flexible date formats (ISO 8601: `2012-04-23T18:25:43.511Z` and custom: `2015-08-28 13:15:00`)

**Data Transfer Objects:**
- Same proxy objects as V1
- Additional: `proxy.AddSaldoResult` - Balance addition result with saldo
- Additional: `proxy.RFIDStatus` - RFID authorization status
- Additional: `proxy.Occupation` - Occupation data object

**V2-Specific Features:**
- New methods: `getJsonBikes`, `getJsonSubscriptors`, `updateLocker`, `isAllowedToUse`
- REST service compatibility at `/v2/REST/`
- Enhanced logging with method tracking in `webservice_log` table

**Database Access:**
- Identical to V1 (inherits all BaseFMSService data access patterns)
- Same queue-based processing for async operations

**Authentication Integration:**
- Identical to V1 (same authentication mechanism and user roles)

### V3 Services Internal Structure

V3 services provide a type-safe, cleaner API that acts as a thin wrapper around BaseFMSService:

**Core Components:**
- Direct calls to `application.baseFMSService` for all operations
- No intermediate service layer or JSON processing
- Uses `argumentcollection = arguments` pattern for clean pass-through

**Key Characteristics:**
- **Type-safe**: All parameters use proper ColdFusion types (`proxy.Bike`, `proxy.Transaction[]`, etc.)
- **No JSON processing**: No `SerializeJSON()` or `DeSerializeJSON()` calls
- **Native returns**: Returns ColdFusion objects, arrays, and queries directly
- **Automatic validation**: ColdFusion validates parameter types before method execution
- **Better error messages**: Clear, English error messages (e.g., "Bikepark #bikeparkID# could not be found")

**Advantages Over V1/V2:**
- **Cleaner code**: No JSON string parsing/validation needed
- **Better performance**: No JSON serialization overhead
- **Type safety**: Compile-time type checking
- **IDE support**: Better code completion and inline documentation
- **Easier debugging**: Native objects easier to inspect than JSON strings

**Data Transfer Objects:**
- Same proxy objects as V1/V2
- Used directly as method parameters and return types
- `proxy.Result` - Standard result with status and message
- `proxy.Bike` / `proxy.Bike[]` - Bike data
- `proxy.Transaction` / `proxy.Transaction[]` - Transaction data
- `proxy.SaldoAdd` / `proxy.SaldoAdd[]` - Balance additions
- `proxy.Subscription` - Subscription data
- `proxy.Sector[]` - Sector information
- `proxy.BikeType` / `proxy.BikeType[]` - Bike type data
- `proxy.SubscriptionType[]` - Subscription type data
- `proxy.ClientType[]` - Client type data
- `proxy.Locker` - Locker information
- `proxy.RFIDStatus` - RFID authorization status
- `proxy.AddSaldoResult` - Balance addition result
- `proxy.PaymentType[]` - Payment types

**Database Access:**
- Identical to V1/V2 (all operations delegated to BaseFMSService)
- Same queue-based processing (`wachtrij_*` tables)
- Same ORM and SQL query patterns

**Authentication Integration:**
- Identical to V1/V2 (same authentication mechanism and user roles)
- Same permit-based access control

**Use Cases:**
- Best for SOAP/WSDL-based integrations
- Ideal for strongly-typed client applications
- Preferred for ColdFusion-to-ColdFusion communication
- Recommended for new integrations requiring type safety

## API Comparison ##

The following table shows which methods are available in each API version. Methods with the same functionality but different names (e.g., `getBikeUpdates` vs `getJsonBikeUpdates`) are grouped together on a single row.

| Method | V1 | V2 | V3 | Access | Description | Tables |
|--------|----|----|----|-------| ----------- |--------|
| **Bike Management** |
| getBikeUpdates / getJsonBikeUpdates | X | X | X | r | Get bike updates since given date | `transacties`, `accounts_pasids`, `gemeenteaccounts`, `accounts` |
| getBikes / getJsonBikes | - | X | X | r | Get all registered bikes | `barcoderegister` |
| saveBike / saveJsonBike | X | X | X | w | Link bike to key fob | `wachtrij_pasids` |
| saveBikes / saveJsonBikes | X | X | X | w | Bulk save bike-pass associations | `wachtrij_pasids` |
| getBikeType / getJsonBikeType | X | X | X | r | Get bike type by ID | `fietstypen` |
| getBikeTypes / getJsonBikeTypes | X | X | X | r | Get all bike types | `fietstypen` |
| **Section/Sector Methods** |
| getSections / getJsonSectors / getSectors | X | X | X | r | Get bikepark sectors | `fietsenstallingen`, `fietsenstalling_sectie` |
| **Financial/Saldo Methods** |
| addSaldo / addJsonSaldo | X | X | X | w | Add balance to account | `wachtrij_betalingen` |
| addSaldos / addJsonSaldos | X | X | X | w | Bulk add balance | `wachtrij_betalingen` |
| getPaymentTypes / getJsonPaymentTypes | X | X | X | r | Get payment types | None (hardcoded) |
| **Transaction Methods** |
| uploadTransaction / uploadJsonTransaction | X | X | X | w | Upload single transaction | `wachtrij_transacties` |
| uploadTransactions / uploadJsonTransactions | X | X | X | w | Bulk upload transactions | `wachtrij_transacties` |
| **Subscription Methods** |
| addSubscription | X | X | X | w | Add new subscription | `abonnementen`, `financialtransactions`, `accounts` |
| subscribe | X | X | X | rw | Link key fob to subscription | `abonnementen`, `accounts_pasids`, `accounts` |
| getSubscriptionTypes / getJsonSubscriptionTypes | X | X | X | r | Get subscription types | `abonnementsvormen`, `abonnementsvorm_fietsenstalling` |
| getSubscriptors / getJsonSubscriptors | - | X | X | r | Get key fobs with subscriptions | `accounts_pasids`, `abonnementen`, `abonnementsvormen`, `abonnementsvorm_fietsenstalling` |
| **Client/User Type Methods** |
| getClientTypes / getJsonClientTypes | X | X | X | r | Get client types | `klanttypen` |
| **Occupation Reporting** |
| reportOccupationData / reportJsonOccupationData | X | X | - | w | Report occupation data | `bezettingsdata`, `fietsenstalling_sectie` |
| **Synchronization** |
| syncSector | X | X | X | w | Synchronize sector with central server | `wachtrij_sync` |
| **Locker Management** |
| getLockerInfo | X | X | X | r | Get locker information | `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasids` |
| setUrlWebserviceForLocker | X | X | X | w | Set locker callback URL | `fietsenstalling_plek` |
| updateLocker | - | X | X | rw | Update locker status | `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `wachtrij_transacties`, `wachtrij_betalingen` |
| isAllowedToUse | - | X | X | r | Check RFID authorization | `fietsenstalling_plek`, `fietsenstalling_plek_bezetting`, `accounts_pasids` |
| **Utility Methods** |
| getServerTime | X | X | X | r | Get server timestamp | None |

**Legend:**
- **X**: Method available in this API version
- **-**: Method not available in this API version
- **Bold**: Method name variations grouped together

## Queue Processing ## 

Many API methods use queue tables (wachtrij_*) for staged processing of incoming data records. This provides asynchronous processing, prevents data loss during high load, and ensures transactional integrity.

### Background Processor

All four queue tables are processed by a single scheduled job:

**File**: `/broncode/remote/remote/processTransactions2.cfm`
- **Scheduled Task**: "wachtrij transacties" in `scheduler.xml`
- **Frequency**: Every 61 seconds
- **Timeout**: 60 seconds (60000ms)
- **Batch Sizes**: 
  - 50 items for bikes and transactions (configurable via `url.n`)
  - 200 items for payments
  - 1 item for sector syncs

**Processing Status Codes**:
- **0**: Pending (not yet processed)
- **8**: Currently being processed (locked)
- **9**: Selected for processing (intermediate state)
- **1**: Successfully processed
- **2**: Error during processing (error message stored in `error` field)

### wachtrij_pasids ###

**Purpose**: Queue for bike-pass associations created by `saveBike`, `saveJsonBike`, `saveBikes`, and `saveJsonBikes` API methods.

**Processing Pipeline**:

1. **Selection Phase**
```sql
SELECT * FROM wachtrij_pasids 
WHERE processed = 0 
ORDER BY transactionDate 
LIMIT 50
```

2. **Processing Phase** - For each record:
   - Retrieve bikepark by `bikeparkID` using `application.service.getBikeparkByExternalID()`
   - Deserialize JSON bike object from `bike` field
   - Call `application.service.saveBikeObject(bike, bikepark)` which:
     - Links `passID` to bike barcode
     - Optionally links RFID to passID or bike
     - Creates or updates records in `accounts_pasids` table
     - Handles bike type associations

3. **Success Handling**:
   - Set `processed = 1`
   - Set `processDate = now()`

4. **Error Handling**:
   - Set `processed = 2`
   - Set `error = exception message`
   - Set `processDate = now()`
   - Send email alert to `veiligstallen@gmail.com`

5. **Tables Updated**:
   - `accounts_pasids` - Bike-pass associations
   - `accounts` - Account updates when new associations created

6. **Archive Process**:
   - File: `archiveWachtrijPasIDs.cfm`
   - Creates daily archive table: `wachtrij_pasids_archive{yyyymmdd}`
   - Moves all processed records except those with `processed IN (0,8,9)`

### wachtrij_transacties ###

**Purpose**: Queue for check-in/check-out transactions created by `uploadTransaction`, `uploadJsonTransaction`, `uploadTransactions`, and `uploadJsonTransactions` API methods.

**Processing Pipeline**:

1. **Selection Phase** (3-step process for transaction safety):
   - **Step 1**: Mark records for processing
   ```sql
   UPDATE wachtrij_transacties 
   SET processed = 9 
   WHERE processed = 0 
   AND transactionDate <= now() 
   ORDER BY transactionDate, type 
   LIMIT 50
   ```
   - **Step 2**: Retrieve marked records
   ```sql
   SELECT * FROM wachtrij_transacties 
   WHERE processed = 9 
   ORDER BY transactionDate, type
   ```
   - **Step 3**: Lock records being processed
   ```sql
   UPDATE wachtrij_transacties 
   SET processed = 8 
   WHERE processed = 9
   ```

2. **Processing Phase** - For each record:
   - Retrieve bikepark by `bikeparkID`
   - Deserialize JSON transaction object from `transaction` field
   - Merge queue record fields into transaction object:
     - `passID`, `passType`, `sectionID`, `typeCheck`, `transactionDate`
     - `transactionID` (if not 0)
     - `externalPlaceID` (if present)
   - Apply special fixes (e.g., convert typeCheck "section" to "user" for Login integration)
   - Call `application.service.uploadTransactionObject(transaction, bikepark)` which:
     - Creates check-in or check-out records in `transacties` table
     - Updates account balances if transaction has a price
     - Updates bike parking status in `accounts_pasids`

3. **Success Handling**:
   - Set `processed = 1`
   - Set `processDate = now()`

4. **Error Handling**:
   - Set `processed = 2`
   - Set `error = exception message`
   - Set `processDate = now()`
   - Send email alert if `price > 0` (financial transactions get priority notification)

5. **Tables Updated**:
   - `transacties` - Check-in/check-out records
   - `accounts_pasids` - Current parking status
   - `accounts` - Balance updates for paid transactions
   - `financialtransactions` - Financial transaction records

6. **Archive Process**:
   - File: `archiveWachtrijTransacties.cfm`
   - Creates daily archive table: `wachtrij_transacties_archive{yyyymmdd}`
   - Moves all processed records except those with `processed IN (0,8,9)`

### wachtrij_betalingen ###

**Purpose**: Queue for balance additions created by `addSaldo`, `addJsonSaldo`, `addSaldos`, and `addJsonSaldos` API methods.

**Processing Pipeline**:

1. **Selection Phase** (3-step process):
   - **Step 1**: Mark records for processing
   ```sql
   UPDATE wachtrij_betalingen 
   SET processed = 9 
   WHERE processed = 0 
   ORDER BY transactionDate 
   LIMIT 200
   ```
   - **Step 2**: Retrieve marked records
   ```sql
   SELECT * FROM wachtrij_betalingen 
   WHERE processed = 9 
   ORDER BY transactionDate
   ```
   - **Step 3**: Lock records being processed
   ```sql
   UPDATE wachtrij_betalingen 
   SET processed = 8 
   WHERE processed = 9
   ```

2. **Processing Phase** - For each record:
   - Retrieve bikepark by `bikeparkID`
   - Build `saldoAddObject` struct with fields:
     - `amount` - Payment amount
     - `passID` - Key fob or RFID identifier
     - `transactionDate` - When payment was made
     - `paymentTypeID` - Type of payment (cash, pin, etc.)
   - Call `application.service.addSaldoObject(saldoAddObject, bikepark)` which:
     - Updates account balance in `accounts` table
     - Creates financial transaction record
     - Links payment to correct account via `passID`

3. **Success Handling**:
   - Set `processed = 1`
   - Set `processDate = now()`

4. **Error Handling**:
   - Set `processed = 2`
   - Set `error = exception message`
   - Set `processDate = now()`
   - Send email alert to `veiligstallen@gmail.com`

5. **Tables Updated**:
   - `accounts` - Account balance updates
   - `financialtransactions` - Payment records

6. **Batch Size**: 
   - 200 items per run (4x larger than other queues)
   - Larger batch size because balance additions are simpler operations

7. **Duplicate Prevention**:
   - Unique constraint on `(bikeparkID, passID, transactionDate, paymentTypeID, amount)`
   - Prevents duplicate payments from being queued

### wachtrij_sync ###

**Purpose**: Queue for sector synchronization created by the `syncSector` API method. Synchronizes local sector database with central server database.

**Processing Pipeline**:

1. **Selection Phase**:
   ```sql
   SELECT * FROM wachtrij_sync 
   WHERE processed = 0 
   AND transactionDate <= latestProcessedTransactionDate 
   ORDER BY transactionDate 
   LIMIT 1
   ```
   - **Special Logic**: Only processes syncs after ALL regular transactions up to that time are processed
   - Ensures data consistency by waiting for in-flight check-ins/check-outs to complete

2. **Processing Phase** - For each record:
   - Deserialize bikes JSON array from `bikes` field
   - Call `application.transactionGateway.syncSector(bikes, bikeparkID, sectionID, transactionDate)` which:
     - **Check-Out Missing Bikes**: 
       - Bikes in central DB but NOT in the provided array are checked out
       - Updates `accounts_pasids`: sets `huidigeFietsenstallingId` and `huidigeSectieId` to NULL
       - Closes open transactions in `transacties` table (sets `Date_checkout`, `Type_checkout = 'sync'`)
     - **Check-In New Bikes**:
       - Bikes in provided array but NOT in central DB are checked in
       - Updates `accounts_pasids`: sets current bikepark and section
       - Creates check-in transaction records
     - All updates only apply if `dateLastCheck < transactionDate` (prevents old syncs from overwriting newer data)

3. **Success Handling**:
   - Set `processed = 1`
   - Set `processDate = now()`

4. **Error Handling**:
   - Set `processed = 2`
   - Set `error = exception message`
   - Set `processDate = now()`

5. **Tables Updated**:
   - `accounts_pasids` - Current parking location for each bike/pass
   - `transacties` - Synthetic check-in/check-out records for sync operations

6. **Batch Size**: 
   - 1 sync per run (strict sequential processing)
   - Ensures complete synchronization before processing next sync

7. **Use Case**:
   - Used by local bike park systems to reconcile their local database with central database
   - Handles edge cases where local system and central system become out of sync

### Additional Scheduled Maintenance ###

The `processTransactions2.cfm` scheduler also performs maintenance tasks after queue processing:

**Locker Timeout Cleanup**:
- **Purpose**: Release lockers held too long during subscription purchase process
- **When**: Runs after all queue processing completes
- **Logic**: Finds subscriptions where:
  - `isActive = true`
  - `isPaid = false`
  - `startDate < now() - holdPlaceWhileBeingSubscriptedInMinutes`
  - `place.status IN (2, 12)` (reserved or being subscribed)
  - `bikeparkType.id = 'fietskluizen'` (bike lockers only)
- **Action**: 
  - Sets subscription `isActive = false`
  - Sets place `status = FREE`
- **Tables Updated**: `abonnementen`, `fietsenstalling_plek`


