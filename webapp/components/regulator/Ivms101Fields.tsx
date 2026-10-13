"use client";
// Input blocks for the IVMS101 identities on the regulator's Travel Rule tab. Pure presentation:
// the values, and their validation (lib/ivms101), live in the tab.
import { Input, Select } from "@/components/ui";
import { NATURAL_ID_TYPES, type FieldErrors, type PartyInput, type VaspInput } from "@/lib/ivms101";
import { captionCls } from "./desk";

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-[11px] text-tape-deep">{msg}</p> : null;
}

export function PartyFields({
  id,
  title,
  value,
  errors,
  onChange,
  showErrors,
}: {
  id: string;
  title: string;
  value: PartyInput;
  errors: FieldErrors<PartyInput>;
  onChange: (v: PartyInput) => void;
  showErrors: boolean;
}) {
  const set = (k: keyof PartyInput) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const err = (k: keyof PartyInput) => (showErrors || value[k] ? errors[k] : undefined);
  return (
    <fieldset className="mt-4 border-t border-ink/25 pt-3">
      <legend className={captionCls}>{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Input id={`${id}-primary`} label="Family name (required)" value={value.primaryName} onChange={set("primaryName")} placeholder="e.g. Santos" autoComplete="off" />
          <Err msg={err("primaryName")} />
        </div>
        <div>
          <Input id={`${id}-secondary`} label="Given names" value={value.secondaryName} onChange={set("secondaryName")} placeholder="e.g. Maria Clara" autoComplete="off" />
          <Err msg={err("secondaryName")} />
        </div>
        <div>
          <Input id={`${id}-country`} label="Country of residence (ISO 3166)" value={value.country} onChange={set("country")} placeholder="2 letters, e.g. PH" maxLength={2} className="font-mono uppercase" autoComplete="off" />
          <Err msg={err("country")} />
        </div>
        <div>
          <Input id={`${id}-account`} label="Account / Stellar address (required)" value={value.account} onChange={set("account")} placeholder="G… address or the VASP's account reference" spellCheck={false} className="font-mono" autoComplete="off" />
          <Err msg={err("account")} />
        </div>
        <div>
          <Input id={`${id}-dob`} type="date" label="Date of birth" value={value.dateOfBirth} onChange={set("dateOfBirth")} />
          <Err msg={err("dateOfBirth")} />
        </div>
        <div>
          <Input id={`${id}-pob`} label="Place of birth" value={value.placeOfBirth} onChange={set("placeOfBirth")} placeholder="City, e.g. Cebu" autoComplete="off" />
          <Err msg={err("placeOfBirth")} />
        </div>
        <div>
          <Select id={`${id}-idtype`} label="National ID type" value={value.nationalIdType} onChange={set("nationalIdType")}>
            <option value="">None</option>
            {Object.entries(NATURAL_ID_TYPES).map(([code, label]) => (
              <option key={code} value={code}>
                {label} ({code})
              </option>
            ))}
          </Select>
          <Err msg={err("nationalIdType")} />
        </div>
        <div>
          <Input id={`${id}-nid`} label="National ID number" value={value.nationalId} onChange={set("nationalId")} placeholder="As printed on the document" spellCheck={false} className="font-mono" autoComplete="off" />
          <Err msg={showErrors || value.nationalId || value.nationalIdType ? errors.nationalId : undefined} />
        </div>
        <div>
          <Input id={`${id}-idcountry`} label="ID issuing country (ISO 3166)" value={value.nationalIdCountry} onChange={set("nationalIdCountry")} placeholder="2 letters, optional" maxLength={2} className="font-mono uppercase" autoComplete="off" />
          <Err msg={err("nationalIdCountry")} />
        </div>
      </div>
    </fieldset>
  );
}

export function VaspFields({
  id,
  title,
  value,
  errors,
  onChange,
  showErrors,
  namePlaceholder,
}: {
  id: string;
  title: string;
  value: VaspInput;
  errors: FieldErrors<VaspInput>;
  onChange: (v: VaspInput) => void;
  showErrors: boolean;
  namePlaceholder: string;
}) {
  return (
    <fieldset className="mt-4 border-t border-ink/25 pt-3">
      <legend className={captionCls}>{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <Input id={`${id}-name`} label="Registered legal name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder={namePlaceholder} autoComplete="off" />
          <Err msg={showErrors || value.name ? errors.name : undefined} />
        </div>
        <div>
          <Input id={`${id}-country`} label="Country (ISO 3166)" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} placeholder="e.g. US" maxLength={2} className="font-mono uppercase" autoComplete="off" />
          <Err msg={showErrors || value.country ? errors.country : undefined} />
        </div>
      </div>
    </fieldset>
  );
}
