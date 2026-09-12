import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/habiv/legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "The cookies and browser storage Habiv uses, what each one is for and how long it lasts. No advertising or third-party tracking cookies.",
  alternates: { canonical: "/cookies" },
};

const cookies: [name: string, purpose: string, duration: string][] = [
  ["sb-…-auth-token", "Keeps you signed in (set by Supabase Auth). Only present when you have signed in.", "Until you sign out, up to 400 days"],
  ["hv_pid", "A random anonymous player ID. It counts plays fairly, ties your runs and leaderboard entries to this browser, stops abuse, and feeds the totals creators see.", "400 days"],
  ["hv_hs", "Remembers that you have finished setting up your handle, so creator pages load without an extra check. Signed-in users only.", "400 days"],
];

const storage: [key: string, purpose: string][] = [
  ["habiv-theme", "Your light or dark theme choice."],
  ["Playback preferences", "Settings such as autoplay and sound."],
  ["Recent searches", "Your last few searches, shown in the search box."],
  ["hv:save:…", "Progress saved by games you play."],
  ["Player link marker", "Notes that this browser's anonymous plays are already linked to your account."],
  ["Session ID (session storage)", "Groups events from one visit. Cleared when you close the tab."],
];

export default function CookiesPage() {
  return (
    <LegalPage path="/cookies" title="Cookie Policy" intro="The cookies and browser storage Habiv uses, and what each one does.">
      <p className="hb-legal-note">
        Habiv uses a small number of first-party cookies to keep you signed in and to count plays. We don&apos;t use advertising cookies or
        third-party tracking cookies.
      </p>

      <h2>Cookies</h2>
      <div className="hb-legal-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Lasts</th>
            </tr>
          </thead>
          <tbody>
            {cookies.map(([name, purpose, duration]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{purpose}</td>
                <td>{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Browser storage</h2>
      <p>These are kept in your browser&apos;s local storage and never sent to us automatically.</p>
      <div className="hb-legal-table">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {storage.map(([key, purpose]) => (
              <tr key={key}>
                <td>
                  <code>{key}</code>
                </td>
                <td>{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Analytics</h2>
      <p>
        Play analytics are first-party: events go to our own servers and are described in the <Link href="/privacy">Privacy Policy</Link>. We also
        use Vercel Web Analytics for aggregate page views. It doesn&apos;t set cookies.
      </p>

      <h2>Games</h2>
      <p>
        Games run on a separate domain inside a sandbox. They can&apos;t read Habiv&apos;s cookies, but a game may keep its own save data in your
        browser.
      </p>

      <h2>Your choices</h2>
      <p>
        You can block or delete cookies in your browser settings. If you block <code>sb-…-auth-token</code> you won&apos;t be able to sign in. If you
        clear <code>hv_pid</code>, your anonymous plays and scores in this browser start again. Questions: <Mail subject="Cookies" />.
      </p>
    </LegalPage>
  );
}
