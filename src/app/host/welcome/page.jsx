import { redirect } from "next/navigation";

// La visite guidée n'est plus une page : c'est un overlay joué sur l'écran de
// création (voir src/components/HostTour.jsx). On conserve la route en
// redirection plutôt que de la supprimer — elle est encore le lien « Aide &
// visite guidée » du pied de page, présent sur toutes les pages /host/*, et
// peut avoir été mise en signet.
export default function WelcomePage() {
  redirect("/host?tour=1");
}
