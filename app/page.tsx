import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <span className="text-center">
        Hello World, visit
        <Link className="px-5 text-pink-500 underline font-bold italic" href={'/api/graphql'}>GraphiQl Panel</Link>
        to explore the dashboard and wait for the docs to be updated on how to auto-generate Pothos GraphQL input types and crud operations (all queries and mutations).
        <br />

      </span>
        <img 
        className="border-2 border-white animate-pulse"
        src="https://media4.giphy.com/media/nvb74G5HEcQhoah9Hv/giphy.gif?cid=6c09b952y19g7w2lhw8fby3jv9n0uua3j9do8nebhuh5wlkm&ep=v1_gifs_search&rid=giphy.gif&ct=g" alt="GraphQl" />
      Easily convert a prisma schema into a full graphql CRUD API.
    </main>
  );
}
