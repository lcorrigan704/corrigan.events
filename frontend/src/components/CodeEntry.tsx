import { FormEvent, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowRight } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "./ui/input-otp";
import { Button } from "./ui/button";

export function CodeEntry({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");

  function submitCode(nextCode: string) {
    if (nextCode.length === 6 && nextCode !== submittedCode) {
      setSubmittedCode(nextCode);
      onSubmit(nextCode);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitCode(code);
  }

  return (
    <form onSubmit={submit} className="flex items-center justify-center gap-3">
      <InputOTP
        value={code}
        maxLength={6}
        onChange={(value) => {
          setCode(value);
          if (value.length < 6) {
            setSubmittedCode("");
          }
          submitCode(value);
        }}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} className="h-12 w-12 bg-background text-lg font-black" />
          <InputOTPSlot index={1} className="h-12 w-12 bg-background text-lg font-black" />
          <InputOTPSlot index={2} className="h-12 w-12 bg-background text-lg font-black" />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} className="h-12 w-12 bg-background text-lg font-black" />
          <InputOTPSlot index={4} className="h-12 w-12 bg-background text-lg font-black" />
          <InputOTPSlot index={5} className="h-12 w-12 bg-background text-lg font-black" />
        </InputOTPGroup>
      </InputOTP>
      <Button type="submit" size="icon" disabled={code.length !== 6} aria-label="Open draw">
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
