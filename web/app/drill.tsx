"use client";

import { useState } from "react";

// All fictional. Tells quote the exact words, so the lesson is what to look for, not just the score.
const MAILS = [
  { from: "hr.tcs.careers@gmail.com", subject: "TCS Digital offer letter", body: "You are selected. Pay Rs 2,500 as a refundable security deposit to receive your joining kit.", fake: true, tell: "Real companies never charge to hire you, and TCS doesn't recruit from a Gmail address." },
  { from: "library@rishihood.edu.in", subject: "Book due on Friday", body: "Your copy of Introduction to Algorithms is due back on Friday. Renew it at the library desk.", fake: false, tell: "It comes from a college office, asks for nothing, and there's no link or pressure." },
  { from: "support@bank-kyc-update.example", subject: "Your account will be blocked today", body: "Complete your KYC within 2 hours by entering your card number and OTP on the link below.", fake: true, tell: "Banks never ask for an OTP by mail. The deadline in hours is there to stop you thinking." },
  { from: "careers@lumensoft.example", subject: "Interview on Monday at 10", body: "Thanks for applying. Your technical round is on Monday. We never charge candidates any fee.", fake: false, tell: "You applied, they ask for nothing, and it mentions a real interview. Stating that there's no fee is a good sign." },
  { from: "prof.sharma.college@gmail.com", subject: "Quick favour needed", body: "I'm in a meeting. Please buy 4 gift cards for a student event and send me the codes. I'll repay you.", fake: true, tell: "Impersonating a teacher is a classic trick. Gift card codes are as good as cash, and no real professor asks for them." },
] as const;

export function ScamDrill() {
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const done = index >= MAILS.length;

  function answer(fake: boolean) {
    setGuess(fake);
    if (fake === MAILS[index].fake) setScore(score + 1);
  }
  function next() {
    setGuess(null);
    setIndex(index + 1);
  }

  if (done)
    return (
      <div className="rise border border-white/15 p-8 text-center" aria-live="polite">
        <p className="font-display text-6xl font-extrabold text-flame">
          {score}/{MAILS.length}
        </p>
        <p className="mt-3 text-lg text-white/80">{score === MAILS.length ? "Sharp eyes. Scammers would struggle with you." : "Every miss is a scam that would have reached you. MAILicious is there for those days."}</p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setScore(0);
          }}
          className="mt-6 bg-flame px-5 py-3 font-bold text-black hover:bg-white"
        >
          Play again
        </button>
      </div>
    );

  const mail = MAILS[index];
  const right = guess === mail.fake;
  return (
    <div key={index} className="rise">
      <div className="mb-3 flex items-center gap-1.5" aria-label={`Mail ${index + 1} of ${MAILS.length}`}>
        {MAILS.map((m, i) => (
          <span key={m.subject} className={`h-1.5 flex-1 rounded-sm ${i <= index ? "bg-flame" : "bg-white/20"}`} />
        ))}
      </div>
      <div className="rounded-lg bg-white p-6 text-black">
        <p className="font-display text-xl font-bold">{mail.subject}</p>
        <p className="mt-1 text-sm text-muted">{mail.from}</p>
        <p className="mt-4">{mail.body}</p>
      </div>
      {guess === null ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => answer(false)} className="border-2 border-white px-4 py-3 font-bold text-white hover:bg-white hover:text-black">
            Looks real
          </button>
          <button type="button" onClick={() => answer(true)} className="bg-flame px-4 py-3 font-bold text-black hover:bg-white">
            Looks fake
          </button>
        </div>
      ) : (
        <div className="rise mt-4" aria-live="polite">
          <p className={`font-display text-xl font-bold ${right ? "text-[#6ee7a0]" : "text-[#ff9c8f]"}`}>
            {right ? "Correct." : "Not quite."} This one is {mail.fake ? "fake" : "genuine"}.
          </p>
          <p className="mt-1 text-white/80">{mail.tell}</p>
          <button type="button" onClick={next} className="mt-4 bg-flame px-5 py-3 font-bold text-black hover:bg-white">
            {index === MAILS.length - 1 ? "See my score" : "Next mail"}
          </button>
        </div>
      )}
    </div>
  );
}
