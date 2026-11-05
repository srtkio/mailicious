// Accuracy test set for the engine. Every mail, person and address here is fictional.
// Real company names appear only in mail text; every domain is .example or the college's own.
// Written to look like real placement mail, not to pass the engine: misses are recorded in eval.test.ts.
import type { Level, LinkPair } from "@/lib/types";

export type Mail = {
  id: string;
  kind: "scam" | "genuine";
  category: string;
  text: string;
  sender: string;
  headers?: string;
  linkPairs?: LinkPair[];
  attachments?: string[];
  min?: Level; // scams: the engine must say at least this
  max?: Level; // genuine: the engine must say at most this
};

const auth = (from: string, result: string, extra = "") => `Delivered-To: student@rishihood.edu.in
Received: from mail.sender.example by mx.google.com; Thu, 05 Nov 2026 09:12:00 +0530
Authentication-Results: mx.google.com;
       ${result}
From: <${from}>${extra}
Subject: Placement update`;
const PASS = "spf=pass smtp.mailfrom=sender.example; dkim=pass header.i=@sender.example; dmarc=pass header.from=sender.example";

export const MAILS: Mail[] = [
  // --- scams ---
  { id: "otp-1", kind: "scam", category: "OTP theft", sender: "hr.desk@quickhire.example", min: "high",
    text: "Dear candidate, you are shortlisted for the Wipro graduate trainee role. To verify your profile, please reply with the 6 digit OTP we just sent to your registered mobile." },
  { id: "otp-2", kind: "scam", category: "OTP theft", sender: "talent@nexgen-staffing.example", min: "high",
    text: "Interview slot confirmation. Our system sent you a code by SMS. Kindly forward that code to this mail so we can lock your Friday slot." },
  { id: "otp-3", kind: "scam", category: "OTP theft", sender: "verify@offerdesk.example", min: "high",
    text: "Congratulations! Your Accenture offer letter is ready. Enter the verification code you receive on the next screen and type it back here to download the letter." },
  { id: "fee-1", kind: "scam", category: "Fee scam", sender: "careers.tcs.india@gmail.com", min: "high",
    text: "Dear student, you are selected for TCS Digital. A refundable security deposit of Rs 2,500 is required to issue your joining kit. Pay to the UPI ID below within 24 hours." },
  { id: "fee-2", kind: "scam", category: "Fee scam", sender: "onboarding@brightpath-hr.example", min: "high",
    text: "Your internship is confirmed. Training material costs INR 1999, which will be returned with your first stipend. Kindly transfer it today to begin." },
  { id: "fee-3", kind: "scam", category: "Fee scam", sender: "hiring@remotegigs.example", min: "high",
    text: "Work from home internship, Rs 25,000 stipend. Only a one-time laptop shipping amount of ₹899 must be cleared before dispatch. Reply once paid." },
  { id: "id-1", kind: "scam", category: "ID theft", sender: "documents@hirefast.example", min: "high",
    text: "Final step of your Infosys onboarding: send a scan of your Aadhaar card, PAN card and a cancelled cheque by tonight for background verification." },
  { id: "id-2", kind: "scam", category: "ID theft", sender: "payroll@campusconnect.example", min: "high",
    text: "To set up your stipend, reply with your bank account number, IFSC and debit card number." },
  { id: "spoof-1", kind: "scam", category: "Spoofing", sender: "placement@rishihood.edu.in", min: "high",
    headers: auth("placement@rishihood.edu.in", "spf=fail smtp.mailfrom=bulk.sender.example; dkim=none; dmarc=fail header.from=rishihood.edu.in"),
    text: "Urgent placement drive: Deloitte is hiring. Register on the new portal before 5 pm today." },
  { id: "spoof-2", kind: "scam", category: "Spoofing", sender: "recruit@orbitlabs.example", min: "medium",
    headers: auth("recruit@orbitlabs.example", PASS, "\nReply-To: <orbitlabs.hr@collect-desk.example>"),
    text: "We liked your resume. Reply to this mail with your updated CV and availability for an interview." },
  { id: "link-1", kind: "scam", category: "Disguised link", sender: "careers@talentbridge.example", min: "high",
    linkPairs: [{ text: "careers.microsoft.com", href: "https://login-verify.example/ms" }],
    text: "Your Microsoft internship application needs one more step. Log in at careers.microsoft.com to accept." },
  { id: "link-2", kind: "scam", category: "Disguised link", sender: "jobs@amazon-hiring.example", min: "high",
    linkPairs: [{ text: "Accept offer", href: "http://203.0.113.45/accept" }],
    text: "Amazon is pleased to offer you an SDE internship. Accept your offer before it expires tonight." },
  { id: "link-3", kind: "scam", category: "Disguised link", sender: "hr@peoplefirst.example", min: "medium",
    text: "Shortlisted for the Flipkart supply chain internship! Download your offer letter: https://bit.ly/fk-offer26" },
  { id: "look-1", kind: "scam", category: "Lookalike domain", sender: "hr@infosys-careers.example", min: "high",
    text: "Infosys campus hiring: you cleared round one. Your interview link will follow." },
  { id: "look-2", kind: "scam", category: "Lookalike domain", sender: "talent@acc3nture.example", min: "high",
    text: "Greetings from Accenture. You are selected for the Associate Software Engineer role. Find attached your offer." },
  { id: "look-3", kind: "scam", category: "Lookalike domain", sender: "noreply@careers-portal.example", min: "high",
    linkPairs: [{ text: "View your offer", href: "https://xn--gogle-0nd.example/offer" }],
    text: "Google internship offer. View your offer and sign within 48 hours." },
  { id: "hack-1", kind: "scam", category: "Hacked college account", sender: "ananya.s@rishihood.edu.in", min: "medium",
    text: "Hi all, my cousin's company is hiring interns for paid work, 15k a month. Fill this form quickly, seats are limited: https://forms.gle/x7Kq2demo" },
  { id: "hack-2", kind: "scam", category: "Hacked college account", sender: "prof.mehta@rishihood.edu.in", min: "medium",
    linkPairs: [{ text: "Internship list", href: "https://docs-share.example/internships" }],
    text: "Dear students, please see the internship list shared by the department. Sign in with your college mail to view." },
  { id: "mal-1", kind: "scam", category: "Malware attachment", sender: "hr@silverline.example", min: "high", attachments: ["Offer_Letter.pdf.exe"],
    text: "Please find your offer letter attached. Open it on a laptop to see the joining details." },
  { id: "mal-2", kind: "scam", category: "Malware attachment", sender: "recruitment@zenithcorp.example", min: "medium", attachments: ["Interview_Schedule.html"],
    text: "Your interview schedule is attached. Open the file and sign in to confirm your slot." },
  { id: "mal-3", kind: "scam", category: "Malware attachment", sender: "jobs@apexsoft.example", min: "high", attachments: ["Assessment_App.apk"],
    text: "Install the attached assessment app on your phone to take the coding round." },

  // --- genuine ---
  { id: "real-1", kind: "genuine", category: "Placement cell", sender: "placement@rishihood.edu.in", max: "low",
    text: "Dear students, Deloitte will visit campus on 14 November for analyst roles. Register on the placement portal by Monday. Do not share your OTP or password with anyone claiming to be from a company." },
  { id: "real-2", kind: "genuine", category: "Placement cell", sender: "placement@rishihood.edu.in", max: "low",
    text: "Reminder: there is no registration fee for any campus drive. If anyone asks you to pay, report it to the placement cell." },
  { id: "real-3", kind: "genuine", category: "Placement cell", sender: "placement@rishihood.edu.in", max: "low",
    text: "Shortlist for the Wipro interview round is out. Shortlisted students please carry a printed resume and college ID card on Thursday." },
  { id: "real-4", kind: "genuine", category: "Company", sender: "campus@northwind.example", max: "low",
    headers: auth("campus@northwind.example", PASS),
    text: "Hi Riya, thanks for applying to the Northwind summer internship. Your technical interview is on 12 November at 3 pm on our video platform. Stipend is ₹30,000 per month." },
  { id: "real-5", kind: "genuine", category: "Company", sender: "talent@contoso.example", max: "low",
    text: "Your online assessment for the Contoso graduate program opens tomorrow. You'll get a login link from our assessment partner. We never ask for payment at any stage." },
  { id: "real-6", kind: "genuine", category: "Company", sender: "hr@fabrikam.example", max: "low",
    text: "We are pleased to offer you the role of Associate Engineer at Fabrikam with a CTC of 8 LPA. Please sign the offer on our HR portal within 7 days." },
  { id: "real-7", kind: "genuine", category: "Onboarding", sender: "onboarding@fabrikam.example", max: "medium",
    text: "Welcome aboard! Before your joining date, please upload your PAN card and bank account details on the secure HR portal for payroll. Do not send them by mail." },
  { id: "real-8", kind: "genuine", category: "Third-party recruiter", sender: "priya.n@staffwell.example", max: "medium",
    text: "Hi, I'm a recruiter at Staffwell, hiring for our client Amazon. Would you be open to a call this week about an operations internship? Apply through amazon.jobs and mention my name." },
  { id: "real-9", kind: "genuine", category: "Third-party recruiter", sender: "jobs@hirewheel.example", max: "low",
    text: "New internship matching your profile: Frontend Intern at Tailspin Labs, remote, ₹20,000 per month. Apply on HireWheel before Sunday." },
  { id: "real-10", kind: "genuine", category: "Fees mentioned", sender: "placement@rishihood.edu.in", max: "medium",
    text: "The university placement fee for the 2027 batch is included in your semester fees. You do not need to pay any company directly." },
  { id: "real-11", kind: "genuine", category: "OTP warning", sender: "security@hirewheel.example", max: "low",
    text: "Your HireWheel login code is 482913. It expires in 10 minutes. HireWheel staff will never ask you for this code." },
  { id: "real-12", kind: "genuine", category: "Interview logistics", sender: "recruiting@woodgrove.example", max: "low",
    text: "Your interview at Woodgrove Bank is confirmed for Monday 10 am. Our office address is 4th floor, Sector 62, Noida, PIN code 201309. Bring a government photo ID for the security desk." },
  { id: "real-13", kind: "genuine", category: "Company", sender: "careers@litware.example", max: "low",
    linkPairs: [{ text: "careers.litware.example", href: "https://careers.litware.example/apply/4411" }],
    text: "Thanks for your interest in Litware. Complete your application at careers.litware.example." },
  { id: "real-14", kind: "genuine", category: "Rejection", sender: "talent@contoso.example", max: "low",
    text: "Thank you for interviewing with Contoso. We won't be moving forward this time, but we'd like to keep your profile for future internship openings." },
  { id: "real-15", kind: "genuine", category: "Faculty", sender: "prof.mehta@rishihood.edu.in", max: "medium",
    text: "Students interested in the research internship in my lab this winter, please reply by Friday with your CV. Stipend is from the department grant." },
  { id: "real-16", kind: "genuine", category: "Urgent but real", sender: "placement@rishihood.edu.in", max: "low",
    text: "Urgent: the Accenture test link closes today only at 6 pm. Log in on the official Accenture assessment portal from the earlier mail." },
  { id: "real-17", kind: "genuine", category: "Attachment", sender: "hr@fabrikam.example", max: "low", attachments: ["Fabrikam_Offer_Letter.pdf"],
    text: "Please find your signed offer letter attached. Reach out if you have questions about joining." },
  { id: "real-18", kind: "genuine", category: "WhatsApp group", sender: "placement@rishihood.edu.in", max: "medium",
    text: "Students selected for the Infosys drive, join the official placement WhatsApp group for venue updates. The link is on the notice board." },
  { id: "real-19", kind: "genuine", category: "Hackathon", sender: "events@codecraft.example", max: "low",
    text: "Registrations are open for the CodeCraft hackathon. Top teams get internship interviews with our hiring partners. Entry is free." },
  { id: "real-20", kind: "genuine", category: "Gmail forward", sender: "rohan.k.dev@gmail.com", max: "medium",
    text: "Hey, forwarding the Tailspin internship post my senior shared. They're hiring interns, apply on their careers page if you're interested." },
];
