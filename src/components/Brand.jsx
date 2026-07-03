import Image from "next/image";
import Link from "next/link";

// Marque valio réutilisable : logo optimisé (next/image), fond transparent.
// Le wordmark complet (« valio.fanontaniana ») est déjà intégré au logo.
// `as="span"` pour une version non cliquable ; sinon lien vers l'accueil.
export default function Brand({ as }) {
  const content = (
    <Image
      src="/logo.png"
      alt="valio.fanontaniana"
      width={241}
      height={34}
      priority
      className="brand__logo"
    />
  );
  if (as === "span") return <span className="brand">{content}</span>;
  return (
    <Link href="/" className="brand">
      {content}
    </Link>
  );
}
