import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/habiv/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Habiv collects when you play or publish games, why, who processes it, how long it is kept, and how to control it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const { operator, minimumAge } = legal;
  return (
    <LegalPage path="/privacy" title="Privacy Policy" intro="What we collect when you play or publish on Habiv, why we collect it, and how to control it.">
      <p className="hb-legal-note">
        <strong>The short version:</strong> we collect what we need to run Habiv, count plays fairly and show creators how their games are doing.
        Creators only see totals, never who you are. We don&apos;t sell personal data, we don&apos;t show ads, and we don&apos;t use third-party
        tracking cookies.
      </p>

      <h2>Who we are</h2>
      <p>
        Habiv is run by {operator}, the controller of the personal data described here. Contact us about privacy at{" "}
        <Mail subject="Privacy" />.
      </p>

      <h2>What we collect</h2>
      <h3>Your account</h3>
      <p>
        Your email address and password (stored as a hash by our authentication provider). If you sign in with Google or GitHub, we receive your
        email address, name, profile picture and an account ID from that provider.
      </p>
      <h3>Your public profile</h3>
      <p>
        Your @handle, display name, avatar, bio, pronouns, up to three links, follower counts, and previous handles (so that old links redirect).
      </p>
      <h3>What you publish and do</h3>
      <p>
        Games you upload (files, title, tagline, description, tags, controls, cover art), the model, tool, prompt and changelog you add to a version,
        and your comments, likes, saves, follows, reports and blocks.
      </p>
      <h3>Play and usage data</h3>
      <p>When you open or play a game, we record:</p>
      <ul>
        <li>a random anonymous player ID, kept in a cookie (see our <Link href="/cookies">Cookie Policy</Link>), and a session ID for the current tab;</li>
        <li>events such as page views, plays, run start and end, duration, score, level reached, outcome, likes and shares;</li>
        <li>the website that sent you (host name only) and campaign tags in the link (UTM parameters);</li>
        <li>your device type, operating system and browser, worked out from your browser&apos;s user agent;</li>
        <li>your country, worked out from your IP address by our hosting provider. Our analytics store the country, not the IP address.</li>
      </ul>
      <p>
        If you are signed in, this data is linked to your account. When you sign in, earlier anonymous plays from the same browser are linked too,
        so your scores follow you.
      </p>
      <h3>Connected apps</h3>
      <p>
        The names of apps and AI agents you connect, the scopes you approve, when each token was last used, and a hash of each token (never the
        token itself).
      </p>
      <h3>Technical logs</h3>
      <p>
        Like any website, our hosting and infrastructure providers process IP addresses and request logs to deliver pages and keep the service
        secure. We also use Vercel Web Analytics, which counts page views in aggregate without cookies.
      </p>
      <h3>Messages to us</h3>
      <p>Anything you send us by email, such as support requests, reports and appeals.</p>

      <h2>How we use it</h2>
      <ul>
        <li><strong>To run Habiv:</strong> accounts and sign-in, publishing, playing, saving, following, comments, notifications and leaderboards.</li>
        <li><strong>To show creators how their games are doing:</strong> totals such as plays, unique players, completion, retention, countries, devices and referrers. Creators never see which person did what, except for things you do publicly, like comments and leaderboard entries.</li>
        <li><strong>To rank and recommend games,</strong> for example Trending and Most played.</li>
        <li><strong>To keep Habiv safe and fair:</strong> scanning uploads, stopping cheating, spam and abuse, rate limiting, and moderation.</li>
        <li><strong>To talk to you:</strong> sign-in and password emails, replies to your messages, and important notices about the service or these policies.</li>
        <li><strong>To improve Habiv,</strong> and to meet legal obligations.</li>
      </ul>
      <p>We don&apos;t sell personal data, share it for advertising, or use it to make decisions that have legal or similarly significant effects on you.</p>

      <h2>What is public</h2>
      <p>
        Your profile, your published games and their details (including prompt, model and tool), your comments, who you follow and who follows
        you, and your leaderboard entries (handle and score). Only you can see your likes and your saved list.
      </p>

      <h2>Games you play</h2>
      <p>
        Each game runs in a sandboxed frame on a separate domain, so it can&apos;t read your Habiv session or cookies. Game saves are stored in your
        browser. Games are made by creators; tell us if one behaves in a way you don&apos;t expect.
      </p>

      <h2>Legal bases (EEA and UK)</h2>
      <ul>
        <li><strong>Contract:</strong> providing the account and features you ask for.</li>
        <li><strong>Legitimate interests:</strong> play counts, creator analytics, security, anti-cheat, moderation and improving Habiv. These are balanced against your rights, and you can object.</li>
        <li><strong>Consent:</strong> where the law requires it. You can withdraw consent at any time.</li>
        <li><strong>Legal obligation:</strong> where we must keep or disclose data.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>These service providers process data for us, under contracts that limit its use to providing their service:</p>
      <ul>
        <li><strong>Supabase:</strong> database, authentication and file storage.</li>
        <li><strong>Vercel:</strong> website hosting, scheduled jobs and aggregate web analytics.</li>
        <li><strong>Cloudflare:</strong> serving game files from the separate game domain.</li>
        <li><strong>GitHub:</strong> automated jobs that check and convert uploaded games, and sign-in with GitHub if you choose it.</li>
        <li><strong>Google:</strong> sign-in with Google, if you choose it.</li>
      </ul>
      <p>
        We may also disclose data if the law requires it, to protect people&apos;s safety or our rights, or as part of a merger, acquisition or sale
        of the service. If that happens, this policy continues to apply to your data.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Raw play events: about 14 days, after which only daily totals remain.</li>
        <li>Runs, scores and aggregate stats: for as long as the game is on Habiv, so that leaderboards and totals stay correct.</li>
        <li>Account, profile and content: until you delete them or your account.</li>
        <li>Backups and logs: deleted on the providers&apos; normal cycles.</li>
      </ul>

      <h2>Your rights and choices</h2>
      <p>
        You can edit your profile in Settings and delete games from My games. Depending on where you live, you can also ask to access, correct,
        export or delete your data, restrict or object to how we use it, and withdraw consent. To do this, email <Mail subject="Privacy request" />{" "}
        from the address on your account. We reply within 30 days. Deleting your account removes your profile, games and comments. Anonymous
        totals that can no longer identify you may remain.
      </p>
      <p>
        If you are in the EEA or UK, you can also complain to your data protection authority. California residents: we don&apos;t sell or
        &ldquo;share&rdquo; personal information as those terms are defined in the CCPA, and we don&apos;t discriminate against anyone for using their rights.
      </p>

      <h2>Children</h2>
      <p>
        Habiv is not for children under {minimumAge}, and we don&apos;t knowingly collect their personal data. If you think a child has given us data,
        email <Mail subject="Child account" /> and we will delete it.
      </p>

      <h2>International transfers</h2>
      <p>
        Our providers may process data outside your country, including in the United States. Where the law requires it, transfers are covered by
        safeguards such as the European Commission&apos;s Standard Contractual Clauses.
      </p>

      <h2>Security</h2>
      <p>
        We use encryption in transit, row-level access rules in our database, hashed tokens and sandboxed game execution. No system is perfectly
        secure, so please use a strong, unique password.
      </p>

      <h2>Changes</h2>
      <p>
        If we make material changes to this policy, we&apos;ll post them here and give notice before they take effect. The date at the top shows the
        last update.
      </p>
    </LegalPage>
  );
}
