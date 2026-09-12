import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/habiv/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description: "How to report a game or content on Habiv that infringes your copyright, how counter-notices work, and our repeat-infringer policy.",
  alternates: { canonical: "/copyright" },
};

export default function CopyrightPage() {
  const to = legal.copyrightEmail;
  return (
    <LegalPage path="/copyright" title="Copyright Policy" intro="How to tell us about infringing content, and what happens when you do.">
      <p>
        Creators on Habiv must only publish work they have the rights to, including anything produced with AI tools (see our{" "}
        <Link href="/terms">Terms of Service</Link>). If you believe content on Habiv infringes your copyright, send us a notice and we will act
        quickly, in line with the US Digital Millennium Copyright Act (DMCA) and similar laws elsewhere.
      </p>

      <h2>Sending a notice</h2>
      <p>
        Email <Mail to={to} subject="Copyright notice" /> with:
      </p>
      <ol>
        <li>the copyrighted work you believe is infringed, or a list if there are several;</li>
        <li>the link to each game, comment or profile on Habiv that contains the material (for example <code>habiv.com/@handle/game</code>);</li>
        <li>your name, postal address, phone number and email address;</li>
        <li>a statement that you have a good-faith belief the use is not authorised by the copyright owner, its agent or the law;</li>
        <li>a statement that the information in the notice is accurate and, under penalty of perjury, that you are the owner or authorised to act for the owner;</li>
        <li>your physical or electronic signature (typing your full name is fine).</li>
      </ol>
      <p>
        We may forward your notice, including your contact details, to the person who posted the content. Knowingly misrepresenting that material
        infringes can make you liable for damages.
      </p>

      <h2>What we do</h2>
      <p>
        When we get a complete notice, we remove or disable the material and tell the person who posted it. If it&apos;s a game, earlier versions and
        remixes that contain the same material may be removed too.
      </p>

      <h2>Counter-notices</h2>
      <p>
        If your content was removed and you believe that was a mistake or that you have the right to use it, email{" "}
        <Mail to={to} subject="Counter-notice" /> with:
      </p>
      <ol>
        <li>the link to the removed content and where it appeared;</li>
        <li>a statement, under penalty of perjury, that you have a good-faith belief it was removed by mistake or misidentification;</li>
        <li>your name, address and phone number, and a statement that you consent to the jurisdiction of the courts for your address (or, outside the US, any place where Habiv may be found), and that you will accept service of process from the person who sent the notice;</li>
        <li>your physical or electronic signature.</li>
      </ol>
      <p>
        We forward counter-notices to the original complainant. Unless they tell us within 10 business days that they have started legal action,
        we may restore the content 10 to 14 business days after receiving the counter-notice.
      </p>

      <h2>Repeat infringers</h2>
      <p>We close the accounts of creators who repeatedly infringe copyright, where appropriate.</p>

      <h2>Trademarks and other rights</h2>
      <p>
        For trademark, impersonation or other rights complaints, email <Mail subject="Rights complaint" /> with the details and links, and we will
        review them under our <Link href="/guidelines">Community Guidelines</Link>.
      </p>
    </LegalPage>
  );
}
