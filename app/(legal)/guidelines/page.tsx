import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/habiv/legal-page";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "What you can publish and post on Habiv, how remixing and leaderboards stay fair, and how reporting and enforcement work.",
  alternates: { canonical: "/guidelines" },
};

export default function GuidelinesPage() {
  return (
    <LegalPage
      path="/guidelines"
      title="Community Guidelines"
      intro="Habiv works when anyone can open any game with one tap and trust what happens next. These rules keep it that way."
    >
      <h2>Make games people can trust</h2>
      <p>Every game should be safe to open, honest about what it is, and yours to share. Games on Habiv must not include:</p>
      <ul>
        <li><strong>Sexual content.</strong> No nudity or sexual material of any kind, and absolutely nothing that sexualises minors. We report child sexual abuse material to the authorities.</li>
        <li><strong>Graphic violence.</strong> Cartoon and arcade violence is fine. Realistic gore, torture, and violence against real people or groups is not. Horror is welcome in the Horror category if it stays short of extreme gore.</li>
        <li><strong>Hate and harassment.</strong> Nothing that attacks or demeans people for who they are, or that targets, bullies or threatens a real person.</li>
        <li><strong>Self-harm.</strong> Nothing that encourages suicide, self-harm or eating disorders.</li>
        <li><strong>Dangerous or illegal activity.</strong> No promoting or selling drugs, weapons or other illegal goods or services.</li>
        <li><strong>Malicious code.</strong> No malware, cryptominers, fingerprinting or tracking, attempts to break out of the sandbox or reach the network, or anything that degrades a player&apos;s device.</li>
        <li><strong>Scams and deception.</strong> No fake login screens, fake prizes, phishing, real-money gambling, or games that trick players into doing something they didn&apos;t intend.</li>
        <li><strong>Other people&apos;s work.</strong> No copied games, characters, art, music or brands you don&apos;t have rights to. See the <Link href="/copyright">Copyright Policy</Link>.</li>
        <li><strong>Private information.</strong> No publishing someone&apos;s personal details without their permission.</li>
      </ul>

      <h2>Be honest about your game</h2>
      <ul>
        <li>Use a title, cover, tagline and category that match what the game actually is.</li>
        <li>Don&apos;t stuff titles or tags with keywords, and don&apos;t upload the same game again and again.</li>
        <li>Fill in the model and tool fields truthfully. Players like knowing how a game was made.</li>
        <li>Don&apos;t pretend to be another creator or organisation.</li>
      </ul>

      <h2>Keep scores and stats fair</h2>
      <p>
        No bots, scripted runs, forged scores, fake accounts or farming your own plays and likes. Runs are checked on our servers, and flagged
        scores are removed from leaderboards. Repeat cheating gets accounts removed.
      </p>

      <h2>Remix with respect</h2>
      <ul>
        <li>Only remix games whose creators marked them open to remix. Habiv credits the original automatically.</li>
        <li>Make a real change: new mechanics, levels, art or a twist. Re-uploading with a new name isn&apos;t a remix.</li>
        <li>If the original contains third-party assets, their licences still apply to you.</li>
      </ul>

      <h2>Comment like a person</h2>
      <p>
        Critique games, not people. No harassment, slurs, spam, or comment floods promoting yourself. Creators can pin, hide and delete comments on
        their own games.
      </p>

      <h2>Reporting</h2>
      <p>
        Use <strong>Report</strong> on a game, comment or profile, and pick the reason that fits best: spam, abuse, sexual content, violence,
        malware, copyright, broken, or other. Reports are private. For something urgent, email <Mail subject="Urgent report" />.
      </p>

      <h2>What happens when rules are broken</h2>
      <p>
        Uploads are checked automatically before they go public, and reports are reviewed. Depending on how serious and repeated the problem is, we
        may reject a version, hide or remove a game or comment, reset stats, limit features, or suspend or ban an account. Serious harm, such as
        malware or child safety issues, leads to an immediate ban. If you think we got it wrong, write to <Mail subject="Appeal" />.
      </p>
      <p>
        These guidelines are part of our <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
