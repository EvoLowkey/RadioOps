# DYMO Direct Print Design

## Goal
Allow managers to print secure Code 128 radio labels directly from Valet Radio HQ to a locally connected DYMO LabelWriter 450 through DYMO Label Software v8's local web service, while retaining `.label` downloads as a fallback.

## Flow
For one radio, Generate Barcode opens a print-ready dialog. `Print DYMO Label` checks the DYMO framework/web service, finds a LabelWriter 450-class printer, loads the existing DYMO 30336 XML, and submits one print. `Download .label` remains available.

For all radios, the manager confirms credential rotation once. The app obtains all 40 one-time plaintext tokens, builds 40 DYMO 30336 labels, and sends them sequentially to the selected DYMO printer. The UI reports progress. A ZIP download of the 40 `.label` files remains the fallback.

## Failure behavior
If the DYMO framework, local web service, or printer is unavailable, no print is claimed. The manager sees a clear error and can download the `.label` file(s). Credential rotation is not repeated merely because printing fails.

## Security
Tokens remain random credentials validated by Supabase. The website never substitutes WT-XX as the barcode credential. Direct printing does not persist plaintext tokens beyond the active browser session.

## Compatibility
Target DYMO Label Software v8 + LabelWriter 450 + DYMO 30336. Direct printing uses the official DYMO Label Framework browser API when present. Existing Code 128 scanner behavior and Supabase RPC names remain unchanged.
