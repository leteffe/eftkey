---
title: PayTec Terminal Web API

language_tabs: # must be one of https://git.io/vQNgJ
  - javascript

toc_footers:
  - <a href='https://www.paytec.ch'>PayTec AG</a>

search: true
---

# Getting started

## About

Use the PayTec Terminal Web API to access your PayTec POS Terminal from any web-based application.

- Works from any modern web browser
- Terminal and client may run in separate networks, e.g. cash register in LAN and terminal on 4G
- Keeps connection while roaming between networks
- Can also be used when running your web application on a PayTec Android terminal
- Secure TLS 1.2 connection

A comprehensive example application can be found [here](//ecritf.paytec.ch).


## Prerequisites

To access your POS terminal via web, the following is needed:

- PayTec POS terminal with PayTec EP2 software equal or higher than 16.00.00
- Configured cash register integration type: 'KIT'

<aside class="notice">
The terminal uses HTTPS for communication, so make sure outbound TCP port 443
is not blocked! Inbound communication is not used.
</aside>

Communication scheme:

![Communication Scheme](communication.png)


## Terminal simulator

<aside class="success">
** NEW! **
</aside>

To start development, you can use the PayTec [Terminal Simulator](https://ecritf.paytec.ch/trmsim).

The terminal simulator is a web based tool that simulates the terminal part of our cloud based cash register interface.
This lets you start your integration without the need of a physical terminal.

** Note **: The PayTec Virtual Terminal Simulator is a valuable tool for testing and development purposes. However, it is important to be aware of the following differences when compared to a physical POS terminal:

- Missing features: The simulator may not include all features present in a physical terminal, including but not limited to automatically triggered actions, tip entry, reference based transactions, petrol use cases
- Different timing behavior: The timing behavior and status notifications during operations in the simulator may vary from that of a physical terminal.
- Receipt differences: Receipt content may slightly differ between the simulator and an actual terminal.

Keep these differences in mind while utilizing the terminal simulator for your testing and development. For finishing and testing the integration, a physical terminal will be needed.


## Embed the API

### From a web page

At the end of your HTML code, embed the API as a script:

`<script src="//ecritf.paytec.ch/api/v1.0/ecritf.js"></script>`

Instantiate a [POSTerminal](#posterminal) object using its [constructor](#constructor):

`trm = new PayTec.POSTerminal(undefined, { OnConnected: onConnected, ... });`

### From NPM-based frameworks

Add @paytecag/ecritf to your package dependencies:

`npm i -save @paytecag/ecritf`

Import and instantiate a [POSTerminal](#posterminal) object:

`import POSTerminal from '@paytecag/ecritf';`

`trm = new POSTerminal(undefined, { OnConnected: onConnected, ... });`

There is a very basic [example](https://github.com/PayTecAG/ecritf/tree/main/examples/react-native/SimplePOS) available for react-native.
For a more comprehensive sight on how to use the SDK, please consider the web [example](https://ecritf.paytec.ch).


## Pairing

<aside class="notice">
When running your web application on a PayTec Android terminal, the API will automatically
connect to the local payment application, so you don't need to pair your application with
the terminal. You can therefore skip this chapter!
</aside>

Before a web application can communicate with a remote POS terminal, it establishes
a trusted connection providing a temporary pairing code. This code is generated
on the POS terminal via the attendant menu...

![Screenshot start pairing](start_pairing.png) **click 'Go' =>** ![Screenshot pairing code](pairing_code.png)


... and used by the web application via the [pair](#pair) method:

`trm.pair("6017087", "Awesome POS 1234");`

=> the following message will be shown for a few seconds on the terminal:

![Screenshot pairing successful](pairing_successful.png)


```javascript
// store the current pairing info in local browser storage
function onConnected() {
    if (typeof(Storage) !== "undefined") {
        localStorage.setItem("pairingInfo", JSON.stringify(trm.getPairingInfo()));
    }
}

// reuse it in a later session
var pairingInfo;

if (typeof(Storage) !== "undefined") {
    let info = localStorage.getItem("pairingInfo");

    if (info !== undefined) {
        pairingInfo = JSON.parse(info);
    }
}

trm = new PayTec.POSTerminal(pairingInfo, ...
```

Once pairing was successful, pairing info can be [retrieved](#getpairinginfo) and stored
for further sessions.


## Transactions

```javascript
function onTransactionApproved() {
    console.log("All ok\n");
}

trm.setOnTransactionApproved(onTransactionApproved);

if (trm.canPerformTransactions()) {
    trm.startTransaction({
            TrxFunction: trm.TransactionFunctions.PURCHASE,
            TrxCurrC: 756,
            AmtAuth: 1000
        }
    );
}
```

Once [activated](#activate), the terminal is ready to [start a transaction](#starttransaction).
The result of this operation is reported through the [OnTransactionApproved](#ontransactionapproved),
[OnTransactionDeclined](#ontransactiondeclined), [OnTransactionaborted](#ontransactionaborted) and
[OnTransactionReferred](#ontransactionreferred) callback functions.


# POSTerminal

This object represents the POS terminal to interact with. 

## Constructor

`trm = new PayTec.POSTerminal(pairingInfo, options);`

```javascript

// not yet paired:
trm = new PayTec.POSTerminal(
    undefined,
    {
        TrmLng: 'en',
        PrinterWidth: 34,
        OnConnected: myOnConnected
    }
);

// pairing info available e.g. from local storage:
trm = new PayTec.POSTerminal(
    JSON.parse(localStorage.getItem("pairingInfo")),
    options
);

```

| Available options: |
|--------|
|[POSID](#posid)|
|[TrmLng](#trmlng)|
|[PrinterWidth](#printerwidth)|
|[AutoConnect](#autoconnect)|
|[AutoReconnect](#autoreconnect)|
|[AutoConfirm](#autoconfirm)|
|[AddTrxReceiptsToConfirmation](#addtrxreceiptstoconfirmation)|
|[HeartbeatInterval](#heartbeatinterval)|
|[HeartbeatTimeout](#heartbeattimeout)|
|[ConnectionTimeout](#connectiontimeout)|
|[InitializationTimeout](#initializationtimeout)|
|[TransactionTimeout](#transactiontimeout)|
|[DefaultTimeout](#defaulttimeout)|

| Configurable callbacks: |
|--------|
|[OnPairingFailed](#onpairingfailed)|
|[OnPairingSucceeded](#onpairingsucceeded)|
|[OnConnected](#onconnected)|
|[OnDisconnected](#ondisconnected)|
|[OnActivationSucceeded](#onactivationsucceeded)|
|[OnActivationFailed](#onactivationfailed)|
|[OnActivationTimedOut](#onactivationtimedout)|
|[OnDeactivationSucceeded](#ondeactivationsucceeded)|
|[OnDeactivationFailed](#ondeactivationfailed)|
|[OnDeactivationTimedOut](#ondeactivationtimedout)|
|[OnTransactionApproved](#ontransactionapproved)|
|[OnTransactionDeclined](#ontransactiondeclined)|
|[OnTransactionReferred](#ontransactionreferred)|
|[OnTransactionAborted](#ontransactionaborted)|
|[OnTransactionTimedOut](#ontransactiontimedout)|
|[OnTransactionConfirmationSucceeded](#ontransactionconfirmationsucceeded)|
|[OnTransactionConfirmationFailed](#ontransactionconfirmationfailed)|
|[OnTransactionConfirmationTimedOut](#ontransactionconfirmationtimedout)|
|[OnBalanceSucceeded](#onbalancesucceeded)|
|[OnBalanceFailed](#onbalancefailed)|
|[OnBalanceTimedOut](#onbalancetimedout)|
|[OnConfigurationSucceeded](#onconfigurationsucceeded)|
|[OnConfigurationFailed](#onconfigurationfailed)|
|[OnConfigurationTimedOut](#onconfigurationtimedout)|
|[OnInitializationSucceeded](#oninitializationsucceeded)|
|[OnInitializationFailed](#oninitializationfailed)|
|[OnInitializationTimedOut](#oninitializationtimedout)|
|[OnDeviceCommandSucceeded](#ondevicecommandsucceeded)|
|[OnDeviceCommandFailed](#ondevicecommandfailed)|
|[OnDeviceCommandTimedOut](#ondevicecommandtimedout)|
|[OnStatusChanged](#onstatuschanged)|
|[OnReceipt](#onreceipt)|
|[OnMessageSent](#onmessagesent)|
|[OnMessageReceived](#onmessagereceived)|
|[OnError](#onerror)|


## pair

`trm.pair(code, friendlyName);`

```javascript
trm.pair("6017087", "Awesome POS 1234");
```

Establishes a trusted connection between the web application and the POS terminal.


## unpair

`trm.unpair();`

Disconnects from the terminal and removes any pairing info from the POSTerminal object.


## connect

`trm.connect();`

Connects the POSTerminal object with its physical counterpart.


## disconnect

`trm.disconnect();`

Disconnects from the terminal and removes any pairing info from the POSTerminal object.


## activate

`trm.activate()`

Activates the terminal to get ready for transaction processing.


## deactivate

`trm.deactivate()`

Deactivates the terminal. In deactivated state, no transactions can be done.


## startTransaction

`trm.startTransaction(params)`

```javascript
trm.startTransaction({
        TrxFunction: trm.TransactionFunctions.PURCHASE_WITH_CASHBACK,
        TrxCurrC: 756,
        AmtAuth: 1575,
        AmtOther: 1000,
        RecOrderRef: { OrderID: "Order1234" }
    });
```

Starts a new payment transaction.

### Parameters:

<aside class="notice">
For details concerning parameters which depend on certain transaction types,
 please refer to the ep2 resp. corresponding payment system documentation.
</aside>


Parameter | Format | Condition | Description
----------|--------|-----------|------------
AcqID | Numeric | For Cancel Reservation transactions | The registered acquirer identifier
AmtAuth | Numeric | For amount based transaction types | The amount to be authorized, in the currency's minor unit
AmtOther | Numeric | For Purchase with Cashback transactions | Cashback amount, in the currency's minor unit
AppExpDate | Hex string, e.g. '491231' | If PAN-key entry or token based transaction | Application Expiration Date
AppPAN | Hex string, padded with trailing 'F' | If PAN-key entry or token based transaction | Application Primary Account Number
AuthC | String | For Purchase, Phone Authorised transactions | The Authorisation Code received by phone
CVC2 | String | If PAN-key entry transaction and known by the attendant | Card Verification Code 2
TrxCurrC | Numeric | For amount based transaction types | Transaction Currency Code (ISO-4217)
TrxFunction | Numeric | **Mandatory** | [Transaction function](#transactionfunctions) to be used
TrxRefNum | String | For reference based transactions like e.g. Purchase Reservation | Original Transaction Reference Number
TrxReasonC | String | For Account Verification transactions | Transaction Reason Code
TrxReqFlags | Numeric | Optional | [Flags](#transactionrequestflags) that impact the behaviour when starting a transaction
PartialApprovalCap | Numeric | For partial approvals | When set to 1 and initialized by the acquirer, the terminal accepts partial approval of a transaction
RecOrderRef | Object | Optional, supported with SW version >= 24.04.06 | Record Order Reference to submit a merchant generated reference of the transaction to the acquirer


## abortTransaction

`trm.abortTransaction(params)`

```javascript
trm.abortTransaction({
        TrxAbortFlags: trm.TransactionAbortFlags.ABORT_TRX_SILENT
    }
);
```
Aborts a ongoing payment transaction.

Parameter | Format | Condition | Description
----------|--------|-----------|------------
TrxAbortFlags | Numeric | optional | Combination of [Transaction Abort Flags](#transactionabortflags)


## confirmTransaction

`trm.confirmTransaction(params)`

```javascript
trm.confirmTransaction({
        TrxAmt: 500,
        TrxSeqCnt: 1234
    });
```

Confirms a successfully authorized payment transaction. Without this, no money will be
transferred from the cardholder's to the merchant's account, and the authorized amount
is finally reverted.

Parameter | Format | Condition | Description
----------|--------|-----------|------------
TrxAmt | Numeric | If the final transaction amount is lower than the authorized amount, e.g. in case of fuel purchase | Final transaction amount, in the currency's minor unit
TrxSeqCnt | Numeric | For Authorisation Purchase transactions where multiple simultaneous fueling operations are possible | Transaction Sequence Counter of the transaction to be confirmed


## rollbackTransaction

`trm.rollbackTransaction(params)`

```javascript
trm.rollbackTransaction({ TrxSeqCnt: 1234 });
```

Cancels an approved but not yet confirmed transaction, e.g. if a vending machine cannot deliver the purchased goods.

Parameter | Format | Condition | Description
----------|--------|-----------|------------
TrxSeqCnt | Numeric | For Authorisation Purchase transactions where multiple simultaneous fueling operations are possible | Transaction Sequence Counter of the transaction to be rolled back


## balance

`trm.balance()`

Triggers the final balance procedure.


## configure

`trm.configure()`

Lets the terminal download its configuration data from the Service Center/TMS.


## initialize

`trm.initialize(acqID)`

Advises the terminal to update its initialization data from its acquirer(s). If acqID is -1, all acquirers will be reinitialized.


## requestReceipt

`trm.requestReceipt(params)`

```javascript
trm.requestReceipt({
        ReceiptType: trm.ReceiptTypes.TRX_COPY,
        ReceiptID: 1234
    });
```

Request a certain receipt from the terminal. When the receipt is available, [OnReceipt](#setonreceipt) will be called.

Parameter -| Format  | Condition | Description
-----------|---------|-----------|------------
ReceipType | Numeric | mandatory | [Receipt Type](#receipttypes)
ReceiptID  | Numeric | optional | Transaction Sequence Counter for transaction receipts, Acquirer Identifier for initialization receipts.


## print

`trm.print(params)`

```javascript
trm.print({
        ReceiptText: "THE QUICK BROWN FOX",
        ReceiptFlags: trm.ReceiptFlags.MORE_DATA_AVAILABLE
                    | trm.ReceiptFlags.DOUBLE_HEIGHT
    });

trm.print({
        ReceiptText: "jumps over\nthe lazy dog"
    });

trm.print({
        ReceiptText: "iVBORw0KGgoAAAANSUhEUgAAAHgAAAAlCAYAAACJdC37AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAFiIAABYiARsWgo8AAASRSURBVHhe7ZxdU90gEIZztDq2Y79rO73qdfv/f4veO9Oq9atV69haa9+Xs0SChEAgCefoM8NAwrIsLCAJOc6qqrpFGJ3b20GqPZ/NZs8lXRQDtbeTGSrOUjM6VlLhoOqfiF7Or8qhT1u6KNnBNxJ7QaesSjKakRof1A6S0pY2SnZwbg7RgVuSVsCEc0RFLq1tmLN8KueFMIWDFfYyWHInuVgUB69IPDqL5tBFZTIH29gz+pE8FONgF3R6W/BwJiGWM9Hbp2wop3Y7dEiAexpTz3d1V5jsbzCxG0ZTYhtrm2+Wj2labLlI+RPIv5G0l0Cbg/UVPYNDMDs6Ae7iB4H2hTqDdLUnVl+xDsZIPuZobgnHIqZo65SuztJArn5Eo/5cuOqH/hOjHc76Ytpj69JB5xWzRPcxo618rN4+doSUMWWIT3eXbIwuk8lmsG1wBi4lLoJYhzjyjyS+R6hzySQO7jsafUDnM0k26BpIZj7suJBkVkLbB7lDSdKud5LsbIOPnA4+oiEhYWgSBsymxFPReIXrAm3jAU0w2RwMx9UjLhQY+yPBGSVzKvEQRJ2+TfY3WBz7Sl34aV0ZQvHInkhMe7I5BfW9lqTCtLkr5CbbLto2LlFtr4N7u07TJpc9Xfk+fGXtvuiL1ptkJwrElWghxQiTlM6x6+2yKanjPGXtNqT0B0mxc7Il2oXdMYQN8gUfyK+XYIfu+mUJ5KI2LotEUQ42CXFgAK2v9ODwt5IkWT8bKmnAlOTgMTqlfs4cmCG/M4t6Vi/mb7C9hIbqCKnXlkm1lXTpsPJ5BPlifhWPqYvE2FzMDIbRY82u0YGDejuXoG/qvUQsJS3RnW9xbOyR3QY6qD4ODC2Tij3LEutt7CVidBW7yepohPqKIQLnM3XMUtcH6G8cGNBmj92XOt8l4xowHl13X3mgYJZWmpWlqPQY3YmvXpfeXHZ26Ln3mXAIbTpj+6e4GRza6ZSLcZAtG1M2ka2cdcXqyuZgVqxDKoauxuaC1zpPo6/Ne2MQW68pj2C368zKlxw3lmz9Dh3pIytv2i86xiRiSV0qit1kPZKHB+Hghzp7ydI7OHbXuWwstYNt51qz9wr59a8AkN5H2EH4JdfqzZodE6QPEDW+pcY9bpzUhgdpPv+qjZSU0xuh+sNAkWFMoxofG+DeHsI2wje5rk++kD5AYKxsR8zHMObrupUsYqV/aAfzN7mjBTSKDauDiWNp3kAwfwd8A5nPiLcRviK9pu7ewb76O0+qtP0TF+bpLzlWUb+WZcX6PgfVMQKd829+q6IzrxGrwxak91D3R4QvuFznPQOW+yBt0YNiBdc8GVN1MA0dl4jVJ1RDO5gdOGZwgsY6T6qkM/RMXEd6F/EmYp4GNT4nElk6guktkWnjGjLvJf1EYrJBPZKn+36N19D3VK5N9CBQspBROhEz0q8vVbtxz3yXfyVxUY9Jg/x/DV/zUB9/PWGeC2vunf5Als+YalaYaRfI30U+VwjtEFc9dJ45wTh41KoBea4itJ2zWOlDdGFc7yDN1UaB631Ev3Hv0/xO9QcBs7+q/gO+N9k5oy3IOgAAAABJRU5ErkJggg==",
        ReceiptFlags: trm.ReceiptFlags.IS_PNG_IMAGE
    });
```

Prints a text on the terminal's thermal printer.

Parameter -| Format  | Condition | Description
-----------|---------|-----------|------------
ReceiptText | String | mandatory | Text to print. Use '\n' for line breaks. Maximum length is 1000 characters (resp. 1KB UTF8), except for [IS_PNG_IMAGE](#receiptflags)
ReceiptFlags | Numeric | optional | [Flags](#receiptflags) that influence printing.


## deviceCommand

`trm.deviceCommand(params)`

```javascript
trm.deviceCommand({
        DeviceCommandCode: trm.DeviceCommands.REBOOT
    }
);

trm.deviceCommand({
        DeviceCommandCode: trm.DeviceCommands.SCAN_SYMBOL,
        Title: "POS Scanner",
        Text: "Please scan QR or bar code!",
        Timeout: 60000
    }
);
```
Let the terminal perform some [actions](#devicecommands) in addition to payment.

Request format:

Parameter -| Format  | Condition | Description
-----------|---------|-----------|------------
DeviceCommandCode | Numeric | mandatory | [action](#devicecommands) to perform.
Timeout | Numeric | for SCAN_SYMBOL | Timeout in milliseconds
Title | String | for SCAN_SYMBOL | Title for the scanner user interface.
Text | String | for SCAN_SYMBOL | Hint text for the scanner user interface.

Response format (when [onDeviceCommandSucceeded](#ondevicecommandsucceeded) is called):

Parameter -| Format  | Condition | Description
-----------|---------|-----------|------------
DeviceCommandCode | Numeric | mandatory | performed [action](#devicecommands).
ScannedData | String | for SCAN_SYMBOL | Decoded symbol data.



## sendMessage

`trm.sendMessage(message)`

Sends a JSON message to the terminal. This function is meant for use cases not yet reflected in the API.


## supportsAcqID

`trm.supportsAcqID(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) supports an Acquirer Identifier.


## needsAcqID

`trm.needsAcqID(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) needs an Acquirer Identifier.


## needsAmtAuth

`trm.needsAmtAuth(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) needs an Amount, Authorised.


## needsAmount

`trm.needsAmount(trxFunction)`

Alias for [needsAmtAuth](#needsAmtAuth).


## needsAmtOther

`trm.needsAmtOther(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) needs an Amount, Other (cashback amount).


## needsAuthC

`trm.needsAuthC(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) needs an Authorisation Code.


## supportsTrxRefNum

`trm.supportsTrxRefNum(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) supports a Transaction Reference Number.


## needsTrxRefNum

`trm.needsTrxRefNum(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) needs a Transaction Reference Number.


## supportsTrxReasonC

`trm.supportsTrxReasonC(trxFunction)`

Tells whether a [transaction function](#transactionfunctions) supports a Transaction Reason Code.


## hasPairing

`trm.hasPairing()`

Tells whether the API has been provisioned with pairing data.


## getPairingInfo

`trm.getPairingInfo()`

Returns the pairing data in JSON form.


## getSerialNumber

`trm.getSerialNumber()`

Returns the terminal's device serial number.


## getTerminalID

`trm.getTerminalID()`

Returns the Terminal Identification within the payment system.


## getDeviceModelName

`trm.getDeviceModelName()`

Returns the device model name of the terminal.


## getSoftwareVersion

`trm.getSoftwareVersion()`

```javascript
v = trm.getSoftwareVersion();

console.log("Software version: "
    + Math.trunc(v / 10000) + "."
    + Math.trunc((v % 10000) / 100) + "."
    + Math.trunc(v % 100));
```

returns the terminal software version as a number.


## getStatus

`status = trm.getStatus()`

Gets the terminal status as a combination of [flags](#statusflags).


## getActSeqCnt

`actSeqCnt = trm.getActSeqCnt()`

Returns the current Activation Sequence Counter which will be increased whenever a new shift is opened via [activate](#activate).


## getPeSeqCnt

`peSeqCnt = trm.getPeSeqCnt()`

Returns the current Period Sequence Counter which will be increased whenever a new booking period is opened by calling [activate](#activate)
after [balance](#balance).


## canPerformTransactions

`var ready = trm.canPerformTransactions()`

Tells whether the terminal is [activated](#activate), not [locked](#statusflags) and not [busy](#statusflags) with another use case.


## getAcquirers

`trm.getAcquirers()`

```javascript
trm.getAcquirers();
-> [ 1, 4 ]
```

Return an array containing the configured acquirer IDs.


## getAcquirerInfo

`trm.getAcquirerInfo(acqID)`

```javascript
trm.getAcquirerInfo(4)
->
{
    AcqID: 4,
    LastAcqInitDate: "2019-05-26 06:32:26"
}
```

Returns information to a given acquirer ID as an object.


## getBrands

`trm.getBrands()`

```javascript
trm.getBrands();
-> [ "MAESTRO", "MASTERCARD", "V PAY", "VISA" ]
```

Returns an array containing the initialized payment brands


## getCurrencies

`trm.getCurrencies()`

```javascript
trm.getCurrencies();
-> [ 756, 840, 978 ]
```

Returns an array of supported ISO-4217 currency codes.


## getTransactionFunctions

`trm.getTransactionFunctions()`

```javascript
trm.getTransactionFunctions();
-> [ 32768, 2048, 32 ]
```

Returns an array of supported [transaction functions](#transactionfunctions).


## getTransactionFunctionName

`trm.getTransactionFunctionName(trxFunction, language)`

```javascript
trm.getTransactionFunctionName(
    trm.TransactionFunctions.PURCHASE_RESERVATION, "fr");

-> "Vente Réservation"
```

Returns the name of a transaction function in English, German, French or Italian.
If `language` is `undefined`, the current [terminal language](#trmlng) is used.


## POSID

`trm.getPOSID()`  
`trm.setPOSID(value)`

```javascript
trm.setPOSID("pos_1234");
```

Identifier of the Point of Sale, e.g. a cash register number.


## TrmLng

`trm.getTrmLng()`  
`trm.setTrmLng(value)`

```javascript
trm.setTrmLng("en");
trm.setTrmLng("de");
trm.setTrmLng("fr");
trm.setTrmLng("it");
```

Terminal language as ISO 639-1 2 letter code.

Default value: Language as configured on the TMS


## PrinterWidth

`trm.getPrinterWidth()`  
`trm.setPrinterWidth(value)`

Width of the printer for receipt formatting in characters per line.

Default value: 34

## AutoConnect

`trm.getAutoConnect()`  
`trm.setAutoConnect(value)`

Configures whether the API tries to connect automatically to the terminal if pairing info has been provided.

Default value: true


## AutoReconnect

`trm.getAutoReconnect()`  
`trm.setAutoReconnect(value)`

Configures whether the API tries to reconnect automatically to the terminal after connection loss.

Default value: true


## AutoConfirm

`trm.getAutoConfirm()`  
`trm.setAutoConfirm(value)`

Configures whether the API shall automatically confirm successfully authorized payment transactions.

Default value: true.

<aside class="notice">
You should configure this to <code>false</code>  if the final amount is not yet known at transaction start.
</aside>


## AddTrxReceiptsToConfirmation

`trm.getAddTrxReceiptsToConfirmation()`  
`trm.setAddTrxReceiptsToConfirmation(value)`

Configures whether the API shall wait on the transaction receipts before calling [onTransactionConfirmationSucceeded()](#ontransactionconfirmationsucceeded).

Default value: false.

This may facilitate integrating the API by making it unnecessary to wait on [onReceipt()](#onreceipt). If the connection times out after transaction confirmation due to network instability,
[onTransactionConfirmationSucceeded()](#ontransactionconfirmationsucceeded) may be called without the two receipts. If this happens, the missing receipt(s) can be [requested](#requestreceipt) afterwards.


## HeartbeatInterval

`trm.getHeartbeatInterval()`  
`trm.setHeartbeatInterval(value)`

Configures how many milliseconds the API waits with sending heartbeat requests after receiving a message from the terminal.

Default value: 10000.


## HeartbeatTimeout

`trm.getHeartbeatTimeout()`  
`trm.setHeartbeatTimeout(value)`

Configures after how many milliseconds without a message from the terminal the API assumes a connection loss.

Default value: 10000


## ConnectionTimeout

`trm.getConnectionTimeout()`  
`trm.setConnectionTimeout(value)`

Configures how many milliseconds to wait for a [connection](#connect) to the terminal.

Default value: 20000


## InitializationTimeout

`trm.getInitializationTimeout()`  
`trm.setInitializationTimeout(value)`

Configures how many milliseconds to wait for an [initialization](#initialize).

Default value: 120000


## TransactionTimeout

`trm.getTransactionTimeout()`  
`trm.setTransactionTimeout(value)`

Configures how many milliseconds to wait for a [transaction](#starttransaction) to complete.

Default value: 70000


## DefaultTimeout

`trm.getDefaultTimeout()`  
`trm.setDefaultTimeout(value)`

Configures how many milliseconds to wait for any other use case.

Default value: 30000


## OnConnected

`function onConnected() {}`  
`trm.setOnConnected(onConnected)`

Called when the API has successfully connected to the terminal.


## OnDisconnected

`function onDisConnected() {}`  
`trm.setOnDisconnected(onDisConnected)`

Called when the API has lost connection to the terminal.


## OnPairingSucceeded

`function onPairingSucceeded() {}`  
`trm.setOnPairingSucceeded(onPairingSucceeded)`

Called when [pairing](#pair) has succeeded.


## OnPairingFailed

`function onPairingFailed() {}`  
`trm.setOnPairingFailed(onPairingFailed)`

Called when [pairing](#pair) has failed due to any reason.


## OnActivationSucceeded

`function onActivationSucceeded() {}`  
`trm.setOnActivationSucceeded(onActivationSucceeded)`

Called when [activate](#activate) has succeeded.


## OnActivationFailed

`function onActivationFailed() {}`  
`trm.setOnActivationFailed(onActivationFailed)`

Called when [activate](#activate) has failed.


## OnActivationTimedOut

`function onActivationTimedOut() {}`  
`trm.setOnActivationTimedOut(onActivationTimedOut)`

Called when [activate](#activate) has timed out.


## OnDeactivationSucceeded

`function onDeactivationSucceeded() {}`  
`trm.setOnDeactivationSucceeded(onDeactivationSucceeded)`

Called when [deactivate](#deactivate) has succeeded.


## OnDeactivationFailed

`function onDeactivationFailed() {}`  
`trm.setOnDeactivationFailed(onDeactivationFailed)`

Called when [deactivate](#deactivate) has failed.


## OnDeactivationTimedOut

`function onDeactivationTimedOut() {}`  
`trm.setOnDeactivationTimedOut(onDeactivationTimedOut)`

Called when [deactivate](#deactivate) has timed out.


## OnTransactionApproved

`function onTransactionApproved(transactionResponse) {}`  
`trm.setOnTransactionApproved(onTransactionApproved)`

Called when a payment transaction gets successfully authorized.

Please refer to the PayTec ECR Interface Specification for further information about the content of `transactionResponse`.


## OnTransactionDeclined

`function onTransactionDeclined(transactionResponse) {}`  
`trm.setOnTransactionDeclined(onTransactionDeclined)`

Called when a payment transaction is declined by either the acquirer, the card or the terminal.

Please refer to the PayTec ECR Interface Specification for further information about the content of `transactionResponse`.


## OnTransactionReferred

`function onTransactionReferred(transactionResponse) {}`  
`trm.setOnTransactionReferred(onTransactionReferred)`

Called when the card issuer request a voice referral to authorize a payment transaction.

Please refer to the PayTec ECR Interface Specification for further information about the content of `transactionResponse`.


## OnTransactionAborted

`function onTransactionAborted(transactionResponse) {}`  
`trm.setOnTransactionAborted(onTransactionAborted)`

Called when a payment transaction is aborted before completion.

Please refer to the PayTec ECR Interface Specification for further information about the content of `transactionResponse`.


## OnTransactionTimedOut

`function onTransactionTimedOut() {}`  
`trm.setOnTransactionTimedOut(onTransactionTimedOut)`

Called when no transaction response has been received within [TransactionTimeout](#transactiontimeout) milliseconds
after [startTransaction](#starttransaction).


## OnTransactionConfirmationSucceeded

`function onTransactionConfirmationSucceeded(response) {}`  
`trm.setOnTransactionConfirmationSucceeded(onTransactionConfirmationSucceeded)`

Called when the [confirmation](#confirmtransaction) of a payment transaction has been acknowledged by the terminal.

If [AddTrxReceiptsToConfirmation](#addtrxreceiptstoconfirmation) is true, the callback is postponed until the receipts have been received.

```
// If AddTrxReceiptsToConfirmation is true, the response looks like:
{
    "Receipts": [
      {
        "ReceiptType": 1,
        "ReceiptFlags": 2,
        "ReceiptText": "<Merchant receipt text>"
      },
      {
        "ReceiptType": 2,
        "ReceiptFlags": 2,
        "ReceiptText": "&lt;Cardholder receipt text&gt;"
      }
    ]
  }
}

If AddTrxReceiptsToConfirmation is false, or if getting the transaction receipts fails, the response is an empty object:
{}
```

## OnTransactionConfirmationFailed

`function onTransactionConfirmationFailed() {}`  
`trm.setOnTransactionConfirmationFailed(onTransactionConfirmationFailed)`

Called when the [confirmation](#confirmtransaction) of a payment transaction fails.


## OnTransactionConfirmationTimedOut

`function onTransactionConfirmationTimedOut() {}`  
`trm.setOnTransactionConfirmationTimedOut(onTransactionConfirmationTimedOut)`

Called when the [confirmation](#confirmtransaction) of a payment transaction timed out.


## OnBalanceSucceeded

`function onBalanceSucceeded() {}`  
`trm.setOnBalanceSucceeded(onBalanceSucceeded)`

Called when [balance](#balance) has succeeded.


## OnBalanceFailed

`function onBalanceFailed() {}`  
`trm.setOnBalanceFailed(onBalanceFailed)`

Called when [balance](#balance) has failed.


## OnBalanceTimedOut

`function onBalanceTimedOut() {}`  
`trm.setOnBalanceTimedOut(onBalanceTimedOut)`

Called when [balance](#balance) has timed out.


## OnConfigurationSucceeded

`function onConfigurationSucceeded() {}`  
`trm.setOnConfigurationSucceeded(onConfigurationSucceeded)`

Called when [configure](#configure) has succeeded.


## OnConfigurationFailed

`function onConfigurationFailed() {}`  
`trm.setOnConfigurationFailed(onConfigurationFailed)`

Called when [configure](#configure) has failed.


## OnConfigurationTimedOut

`function onConfigurationTimedOut() {}`  
`trm.setOnConfigurationTimedOut(onConfigurationTimedOut)`

Called when [configure](#configure) has timed out.


## OnInitializationSucceeded

`function onInitializationSucceeded() {}`  
`trm.setOnInitializationSucceeded(onInitializationSucceeded)`

Called when [initialize](#initialize) has succeeded.


## OnInitializationFailed

`function onInitializationFailed() {}`  
`trm.setOnInitializationFailed(onInitializationFailed)`

Called when [initialize](#initialize) has failed.


## OnInitializationTimedOut

`function onInitializationTimedOut() {}`  
`trm.setOnInitializationTimedOut(onInitializationTimedOut)`

Called when [initialize](#initialize) has timed out.


## OnDeviceCommandSucceeded

`function onDeviceCommandSucceeded(deviceCommandResponse) {}`  
`trm.setOnDeviceCommandSucceeded(onDeviceCommandSucceeded)`

Called when [deviceCommand](#devicecommand) has succeeded.


## OnDeviceCommandFailed

`function onDeviceCommandFailed() {}`  
`trm.setOnDeviceCommandFailed(onDeviceCommandFailed)`

Called when [deviceCommand](#devicecommand) has failed.


## OnDeviceCommandTimedOut

`function onDeviceCommandTimedOut() {}`  
`trm.setOnDeviceCommandTimedOut(onDeviceCommandTimedOut)`

Called when [deviceCommand](#devicecommand) has timed out.


## OnStatusChanged

`function onStatusChanged(statusResponse) {}`  
`trm.setOnStatusChanged(onStatusChanged)`

Called whenever the terminal [status flags](#statusflags) have changed.

Please refer to the PayTec ECR Interface Specification for further information about the content of `statusResponse`.


## OnReceipt

`function onReceipt(receiptType, receiptText) {}`  
`trm.setOnReceipt(onReceipt)`

Called when a [receipt](#receipttypes) has been received from the terminal. This can happen automatically by performing
use cases or after [requesting](#requestreceipt) a receipt explicitely.


## OnMessageSent

`function onMessageSent(message) {}`  
`trm.setOnMessageSent(onMessageSent)`

Called after the API sends a JSON message to the terminal. This is mainly meant for logging.


## OnMessageReceived

`function onMessageReceived(message) {}`  
`trm.setOnMessageReceived(onMessageReceived)`

Called when the API has received a JSON message from the terminal.

<aside class="warning">
If this callback is used e.g. for logging, it is essential that it returns <code>false</code>. Otherwise
the API does not do any further processing of the message.
</aside>


## OnError

`function onError(message) {}`  
`trm.setOnError(callback)`

Called when an error occurs; message is a textual description of the error.


# Symbolic constants

## TransactionFunctions

`trm.TransactionFunctions.PURCHASE`

The transaction function is a mandatory paramater to [start a payment transaction](#starttransaction).

| Function | Value | Description |
|----------|-------|-------------|
| PURCHASE | 0x00008000 | EFT/POS transaction where the products or services are paid (prepaid, debit or credit) by card (chip or magnetic stripe) or by manual PAN key entry. Additionally a tip can be entered.
| PURCHASE_RESERVATION | 0x00004000 | Purchase referencing a prior reservation
| TIP | 0x00002000 | Not available as a separate transaction type, but terminal allows tip amount entry if this function is supported.
| CASH_ADVANCE | 0x00001000 | Advance of cash at the POS. The transaction is executed as an exchange of different tender: card money for cash.
| CREDIT | 0x00000800 | Exchange of products or services for card money, for example a return
| PURCHASE_PHONE_AUTH | 0x00000400 | Purchase that was authorised by phone after a referral. Additionally a tip can be entered.
| PURCHASE_FORCED_ACCEPTANCE | 0x00000200 | Merchant has forced the transaction to be accepted. Additionally a tip can be entered
| PURCHASE_PHONE_ORDERED | 0x00000100 | Manual entry of card data needed for a transaction, with the cardholder being absent
| AUTHORIZATION_PURCHASE | 0x00000080 | Is used by vending machines where the final amount is unknown when the transaction is authorised
| PURCHASE_MAIL_ORDERED | 0x00000040 | Manual entry of card data needed for a transaction, with the cardholder being absent
| REVERSAL | 0x00000020 | Cancellation of a previous transaction.
| RESERVATION | 0x00000010 | With a reservation, the amount of money that is expected is guaranteed in advance.
| RESERVATION_ADJUSTMENT | 0x00000008 | The amount of money of a prior reservation is increased with the reservation amount adjustment and/or the reservation period is extended
| CONFIRM_PHONE_AUTH_RESERVATION | 0x00000004 | Reservation that was authorised by phone after a referral.
| PURCHASE_WITH_CASHBACK | 0x00000001 | Purchase with Cashback is a service offered to retail customers whereby an amount is added to the total purchase price of a transaction paid by debit/credit card and the customer receives that amount in cash along with the purchase.
| BALANCE_INQUIRY | 0x00020000 | Balance Inquiry is to check the available balance on prepaid card (may be used for debit or credit cards too if supported by the issuer).
| ACTIVATE_CARD | 0x00800000 | An Activate Card transaction is used to activate a new, often pre-funded prepaid card
| LOAD | 0x01000000 | Load transaction is used to load a prepaid card with a chosen load amount
| CANCEL_RESERVATION | 0x02000000 | Cancellation of any reservation transaction (even if it is submitted) to fulfil MasterCard’s requirement: "Processing of Authorisations and Pre-authorisations in the Europe Region."
| ACCOUNT_VERIFICATION | 0x04000000 | Verify cardholder account for Credentials on File transactions

## TransactionRequestFlags

`trm.TransactionRequestFlags.TRX_REPORT_UNKNOWN_NFC_UID`

Flags that impact the behaviour when [starting a transaction](#starttransaction).

| Flag | Value | Description |
|------|-------|-------------|
| TRX_SILENT | 0x00000001 | Start transaction without showing 'Insert card' or the like and don't display idle screen after transaction
| TRX_REPORT_UNKNOWN_NFC_UID | 0x00000004 | Report UID of unknown NFC tags in [onStatusChanged()](#onstatuschanged), e.g. Mifare cards with a data structure unknown to the terminal. If this flag is not set, the transaction will be aborted in this case. What kind of tags are supported at all depends on the terminal device type. Available if PayTec EP2 software equal or higher than 23.00.04, and Mifare processing is enabled on TMS.

## TransactionAbortFlags

`trm.TransactionAbortFlags.ABORT_TRX_SILENT`

Flags that impact the behaviour when [aborting a transaction](#aborttransaction).

| Flag | Value | Description |
|------|-------|-------------|
| ABORT_TRX_SILENT | 0x00000001 | Abort the transaction without showing an error message to the customer

## ReceiptTypes

`trm.ReceiptTypes.TRX`

Types of receipts the terminal can create.

| Type | Value | Description |
|------|-------|-------------|
| TRX | 1 | Transaction receipt |
| TRX_COPY | 2 | Transaction receipt copy - usually the cardholder receipt |
| ACTIVATION | 11 | Terminal activation receipt |
| ACTIVATION_FAILED | 12 | Receipt when terminal activation has failed |
| DEACTIVATION | 13 | Terminal deactivation receipt |
| DEACTIVATION_FAILED | 14 | Receipt when terminal deactivation has failed |
| FINAL_BALANCE | 21 | Final balance receipt |
| FINAL_BALANCE_FAILED | 22 | Receipt when final balance has failed |
| CONFIG | 41 | Configuration receipt |
| INIT | 43 | Initialization receipt |

## ReceiptFlags

`trm.ReceiptTypes.TRX`

Flags that modify receipt printing.

| Flag | Value | Description |
|------|-------|-------------|
| MORE_DATA_AVAILABLE | 0x00000001 | The receipt is not yet finished; more data will be sent. |
| DOUBLE_HEIGHT | 0x00000004 | Use a font with doubled height. |
| INVERSE | 0x00000010 | (From SW Version >= 20) Print inverse text. |
| IS_PNG_IMAGE | 0x00000020 | (From SW Version >= 20) Receipt text is the base64 representation of a PNG image. <aside class="notice">For best printing results, use a black on white (monochrome) image, not wider than 384 pixels. Maximum image size is 14 KB</aside> |

## StatusFlags

`trm.StatusFlags.SHIFT_OPEN`

Flags that describe the terminal's [current state](#getStatus).

| Flag | Value | Description |
|------|-------|-------------|
| SHIFT_OPEN | 0x00000001 | The terminal is in activated state |
| CARD_DATA_AVAILABLE | 0x00000002 | A card with readable chip or magstripe data has been presented |
| BUSY | 0x00000004 | The terminal is busy with a use case. In the state, the POS may not be able to start a new use case. |
| READER_SLOT_OCCUPIED | 0x00000008 | A card is inserted into the chip or combined chip/magnetic stripe reader |
| LOCKED | 0x00000010 | The terminal is locked and cannot perform payment use cases; usually due to an ongoing cardholder dialog initiated by the POS. |
| APPLICATION_SELECTED | 0x00000020 | A payment application has been selected to process the current transaction |
| WAITING_FOR_TRANSACTION_REQUEST | 0x00000040 | The terminal needs a [transaction request](#starttransaction) to proceed. |
| WAITING_FOR_APPLICATION_SELECTION | 0x00000080 | The terminal is waiting for the cardholder to select a payment application |
| ONLINE_PROCESSING | 0x00000100 | The terminal is currently connected to an acquirer or to the TMS/Service Center |
| PRINTER_UNAVAILABLE | 0x00000200 | The terminal's printer is unavailable |
| OUT_OF_PAPER | 0x00000400 | The terminal's printer is out of paper |

## DeviceCommands

`trm.DeviceCommands.EJECT_CARD`

Commands to [perform](#devicecommand) some terminal actions beside payment.

| Command | Value | Description |
|---------|-------|-------------|
| EJECT_CARD | 1 | Eject a card left within a motorized reader |
| EJECT_CARD_FORCED | 2 | Force-eject a card left within a motorized reader |
| REBOOT | 501 | Reboot the terminal |
| SW_UPDATE | 502 | Trigger software update on the terminal |
| START_REMOTE_MAINTENANCE | 511 | (From SW Version >= 20) Start a remote maintenance session if configured on the TMS. Skips waiting for the usual polling interval |
| POS_DEVICE_COMMAND_SUBMIT_LOG_DATA | 521 | (From SW Version >= 20) Ship technical log data to the TMS |
| ENABLE_LANGUAGE_SELECTION | 1001 | Show a language selection dialog if chip card without language preference is inserted |
| DISABLE_LANGUAGE_SELECTION | 1002 | Don't show a language selection dialog if chip card without language preference is inserted |
| SHOW_IDLE | 2001 | Show the terminal's idle message (usually 'Welcome, present card' in activated state. |
| SHOW_CARD_INSERTION | 2002 | Show the card insertion message to the cardholder |
| SCAN_SYMBOL | 2601 | Scans a 1D/2D bar code. Available on Android devices equipped with a scanner and PayTec EP2 software equal or higher than 21.01.11 |
