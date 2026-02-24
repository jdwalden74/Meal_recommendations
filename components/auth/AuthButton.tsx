import { motion } from "motion/react";
import { signIn } from "next-auth/react";

export default function AuthButton({ provider }: { provider: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        signIn(provider, { callbackUrl: "/" });
      }}
    >
      <motion.button
        whileHover={{ scale: 1.04 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        className="px-4 py-2 border flex gap-2 bg-neutral-200 text-[#0a0a0a] font-bold rounded-lg hover:shadow w-full justify-center items-center dark:bg-neutral-800 dark:text-white dark:border-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-white"
      >
        <img
          className="w-6 h-6"
          src={provider === "google" ? "https://www.svgrepo.com/show/475656/google-color.svg" : "https://www.svgrepo.com/show/508699/landscape-placeholder.svg"}
          loading="lazy"
          alt={provider === "google" ? "google logo" : "anonymous logo"}
        />
        <span>Sign in with {provider === "google" ? "Google" : "Anonymous"}</span>
      </motion.button>
    </form>
  );
}
