"use client"
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf, Menu, X, LayoutDashboard, Home, Sun, Moon, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";
import { useTheme } from "next-themes";
import { signOut, useSession } from "next-auth/react";

export function Navbar() {
  const { data: session } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const isActive = (path: string) => location === path;

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 transition-colors duration-300">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-emerald-500 p-1.5 rounded-lg group-hover:bg-emerald-600 transition-colors">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">NutriPlan</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link 
              href="/" 
              className={clsx(
                "text-sm font-medium transition-colors hover:text-emerald-600 dark:hover:text-emerald-400",
                isActive("/") ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
              )}
            >
              Home
            </Link>
            <Link 
              href="/dashboard" 
              className={clsx(
                "text-sm font-medium transition-colors hover:text-emerald-600 dark:hover:text-emerald-400",
                isActive("/dashboard") ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
              )}
            >
              Dashboard
            </Link>
            <Link 
              href="/"   
              className={clsx(
                "text-sm font-medium transition-colors hover:text-emerald-600 dark:hover:text-emerald-400",
                isActive("/dashboard") ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
              )}
              onClick={() => signOut()}
            >
              Log Out
            </Link>
            
            {mounted && (
              <button 
                onClick={toggleTheme}
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                aria-label="Toggle Dark Mode"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            )}

            <Link 
              href={session ? "/dashboard" : "/login"} 
              className="bg-slate-900 dark:bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-slate-800 dark:hover:bg-emerald-700 transition-colors"
            >
              {session ? "Dashboard" : "Sign In"}
            </Link>
          </nav>

          {/* Mobile Menu Actions */}
          <div className="flex items-center gap-4 md:hidden">
            {mounted && (
              <button 
                onClick={toggleTheme}
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            )}
            <button 
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full"
              onClick={toggleMenu}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Nav Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-x-0 top-16 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 p-4 shadow-lg z-40"
          >
            <nav className="flex flex-col gap-4">
              <Link 
                href="/" 
                className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-300"
                onClick={() => setIsMenuOpen(false)}
              >
                <Home className="w-5 h-5" />
                Home
              </Link>
              <Link 
                href="/dashboard" 
                className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-300"
                onClick={() => setIsMenuOpen(false)}
              >
                <LayoutDashboard className="w-5 h-5" />
                Dashboard
              </Link>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link 
                  href="/dashboard"
                  className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-medium transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
