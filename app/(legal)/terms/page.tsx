import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/habiv/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for playing, publishing and remixing games on Habiv, including the licence you give us and other creators.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const { operator, minimumAge, jurisdiction } = legal;
  return (
    <LegalPage path="/terms" title="Terms of Service" intro="The agreement between you and Habiv for using the site, the player, the API and the MCP server.">
      <p className="hb-legal-note">
        <strong>The short version:</strong> play for free, publish only what you have the rights to, keep games safe and honest, and don&apos;t
        cheat or attack the service. You keep ownership of your games. You let us host and show them, and if you mark a game open to remix,
        other creators can build on it.
      </p>

      <h2>1. Agreeing to these terms</h2>
      <p>
        These terms cover habiv.com, the games player, the Habiv API and MCP server, and anything else we run under the Habiv name (together, the
        &ldquo;Service&rdquo;). The Service is run by {operator} (&ldquo;Habiv&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By using it you agree to these
        terms, our <Link href="/guidelines">Community Guidelines</Link> and our <Link href="/copyright">Copyright Policy</Link>. Our{" "}
        <Link href="/privacy">Privacy Policy</Link> explains how we handle personal data. If you use Habiv for an organisation, you agree on its behalf
        and confirm you have the authority to.
      </p>

      <h2>2. Who can use Habiv</h2>
      <ul>
        <li>You must be at least {minimumAge}, or older if your country requires it to use an online service without parental consent.</li>
        <li>If you are under 18, you need permission from a parent or guardian, and they accept these terms for you.</li>
        <li>You can&apos;t use Habiv if we have banned you before, or if the law where you live prohibits it.</li>
      </ul>

      <h2>3. Your account</h2>
      <p>
        Playing doesn&apos;t need an account. Publishing, commenting, saving and following do. Give accurate sign-up details, keep your password
        and API tokens secret, and tell us straight away if you think someone else has access. You are responsible for what happens under your
        account, including actions taken by AI agents or apps you connect to it.
      </p>
      <p>
        Your @handle is your public name. We may reclaim or change a handle that impersonates someone, infringes a trademark, is offensive, or is
        held only to sell it. Old handles redirect for a while after a change and may later be released.
      </p>

      <h2>4. Playing games</h2>
      <p>
        Games on Habiv are made and uploaded by creators, not by us. We run every game in a sandboxed frame on a separate domain and check uploads
        automatically, but we don&apos;t review every game by hand and can&apos;t promise that a game works, is accurate or suits you. Play counts,
        scores and leaderboards are provided for fun. We may reset, correct or remove them, for example to remove cheating.
      </p>

      <h2>5. Publishing games</h2>
      <p>
        You keep all the rights you have in the games, art, text and other content you upload (&ldquo;your content&rdquo;). You are responsible for it.
        By publishing, you confirm that:
      </p>
      <ul>
        <li>you own your content or have every licence and permission needed to publish it on Habiv and grant the licences below. This covers code, art, audio, fonts, libraries and anything an AI tool produced for you;</li>
        <li>your content follows these terms, the Community Guidelines and the law;</li>
        <li>the details you give (title, description, category, model and tool used, prompt) are honest and not misleading.</li>
      </ul>
      <p>
        Uploads go through automated checks before they go public. We may reject, hide, unlist or remove any content, and we may convert or
        repackage files (for example, to make a game run in our player or to create a cover image).
      </p>

      <h2>6. The licence you give Habiv</h2>
      <p>
        To run the Service, you give Habiv a worldwide, non-exclusive, royalty-free licence to host, store, copy, process, adapt (for example
        converting formats, resizing, or generating thumbnails and previews), display, perform, run and distribute your content. The licence also
        lets us promote Habiv and your content, for example with screenshots and covers in feeds, on social media and in marketing. We may
        sublicense these rights only to the service providers that help us run Habiv.
      </p>
      <p>
        This licence ends when you delete your content or your account, except for copies in backups (kept only on their normal cycle), content
        that others have already remixed under section 7, and anything we must keep by law.
      </p>

      <h2>7. Remixes</h2>
      <p>
        When you publish a game you choose whether it is <strong>open to remix</strong> or <strong>no remixes</strong>. If it is open to remix, you give
        every other Habiv user a worldwide, non-exclusive, royalty-free licence to copy and modify that game and publish their modified versions on
        Habiv. Habiv links each remix to the original automatically. You can change the setting at any time; the change applies to new remixes, and
        remixes already published stay up.
      </p>
      <p>
        If you remix a game, you may only do it where the original is open to remix. You must also respect any third-party material inside it, and
        your remix has to follow these terms like any other upload.
      </p>

      <h2>8. Comments and other contributions</h2>
      <p>
        Comments, profile details and anything else you post are your content too. They are covered by the licence in section 6 and must follow the
        Community Guidelines. The prompt, model, tool and changelog you add to a game are shown publicly on its page.
      </p>

      <h2>9. AI tools</h2>
      <p>
        Most games on Habiv are made with AI. You are responsible for how you use AI tools, for following their terms, and for making sure their
        output doesn&apos;t infringe anyone&apos;s rights. We don&apos;t claim ownership of anything you make with them.
      </p>

      <h2>10. Connected apps, the API and MCP</h2>
      <p>
        You can let apps and AI agents (such as Claude Code or Codex) act for you through OAuth approval or a personal token. They can do what the
        approval allows, such as uploading and publishing games. You can revoke access at any time in Settings. We may rate-limit, suspend or change
        API access, and we may revoke a token or connection that is being abused or that puts the Service at risk.
      </p>

      <h2>11. What you must not do</h2>
      <ul>
        <li>Break the law, or help someone else break it.</li>
        <li>Upload malware, cryptominers, phishing pages, trackers, or anything that tries to escape the game sandbox or harm people&apos;s devices.</li>
        <li>Attack, overload, probe or disrupt the Service, or get around its security, limits or moderation.</li>
        <li>Inflate plays, likes, followers, scores or leaderboards with bots, scripts, fake accounts or tampered runs.</li>
        <li>Scrape or bulk-collect data from Habiv, especially personal data, except through the API as intended.</li>
        <li>Impersonate people or organisations, or mislead people about who made a game.</li>
        <li>Spam, or sell or transfer your account or handle.</li>
      </ul>
      <p>
        Found a security problem? Please report it privately to <Mail subject="Security report" /> and give us a reasonable chance to fix it. We
        won&apos;t take action against good-faith research that avoids harm to users and data.
      </p>

      <h2>12. Moderation and enforcement</h2>
      <p>
        Anyone can report a game, comment or profile. If content or behaviour breaks these terms or puts people at risk, we may remove content,
        limit features, or suspend or close accounts. Where we reasonably can, we&apos;ll tell you what we did and why. You can ask us to review a
        decision by writing to <Mail subject="Appeal" />.
      </p>

      <h2>13. Copyright complaints</h2>
      <p>
        We respond to notices of alleged infringement as described in our <Link href="/copyright">Copyright Policy</Link>, and we close the accounts
        of repeat infringers.
      </p>

      <h2>14. Changes to the Service</h2>
      <p>
        Habiv is in beta. Features, limits (such as upload size and storage per creator) and availability may change, and we may pause or stop part
        or all of the Service. We don&apos;t promise any particular uptime. Habiv is free today. If we add paid features, we&apos;ll describe them and
        their terms before you are charged.
      </p>

      <h2>15. Ending your use</h2>
      <p>
        You can stop using Habiv at any time. To delete your account, email <Mail subject="Delete my account" /> from the address on your account.
        We may suspend or end your access if you break these terms, if we have to by law, or if we stop offering the Service. Sections 6 (for the
        exceptions listed there), 7 and 16 to 20 continue after your account ends.
      </p>

      <h2>16. Disclaimers</h2>
      <p>
        The Service and all games are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. As far as the law allows, we disclaim all warranties,
        express or implied, including merchantability, fitness for a particular purpose and non-infringement. We are not responsible for content
        made by creators or other users.
      </p>

      <h2>17. Limitation of liability</h2>
      <p>
        As far as the law allows, Habiv is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, data
        or goodwill. Our total liability for any claim about the Service is limited to the greater of the amount you paid us in the 12 months before
        the claim and USD 50. Nothing in these terms limits liability that can&apos;t be limited by law, or takes away rights you have as a consumer
        where you live.
      </p>

      <h2>18. Indemnity</h2>
      <p>
        As far as the law allows, you will cover Habiv&apos;s reasonable losses and costs, including legal fees, from claims by others that arise from
        your content or from your breach of these terms.
      </p>

      <h2>19. Governing law</h2>
      <p>
        {jurisdiction
          ? `These terms are governed by the laws of ${jurisdiction}, and disputes go to the courts of ${jurisdiction}, except where the law where you live gives you the right to bring a claim at home.`
          : "These terms are governed by the laws of the place where Habiv's operator is established, without regard to conflict-of-law rules. This does not take away any right you have to bring a claim in the courts where you live."}
      </p>

      <h2>20. General</h2>
      <p>
        These terms, together with the policies they link to, are the whole agreement between you and Habiv about the Service. If a part turns out
        to be unenforceable, the rest still applies. If we don&apos;t enforce a right straight away, we haven&apos;t waived it. You can&apos;t transfer
        these terms without our consent; we may transfer them as part of a reorganisation, merger or sale.
      </p>

      <h2>21. Changes to these terms</h2>
      <p>
        We may update these terms. For material changes we&apos;ll give notice on the site, or by email if you have an account, before they take
        effect. If you keep using Habiv after that, you accept the new terms.
      </p>

      <h2>22. Contact</h2>
      <p>
        Questions about these terms: <Mail subject="Terms of Service" />.
      </p>
    </LegalPage>
  );
}
