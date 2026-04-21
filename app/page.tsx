"use client"
import { ArrowRight, CheckCircle, Clock, Heart, Star, Leaf, ChefHat, Users } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();
  const ctaHref = session ? "/dashboard" : "/login";

  return (
    <div className="bg-white dark:bg-slate-950 transition-colors duration-300">
      {/* Hero Section */}
      <section className="relative bg-slate-50 dark:bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-10 dark:opacity-5 bg-[url('https://images.unsplash.com/photo-1543352632-5a4b24e4d2a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwbWVhbCUyMHByZXB8ZW58MXx8fHwxNzcxNDQ3OTgyfDA&ixlib=rb-4.1.0&q=80&w=1080')] bg-cover bg-center" />
        <div className="container mx-auto px-4 py-24 md:py-32 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <motion.span 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-block py-1 px-3 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-semibold mb-6"
            >
              Start your journey today
            </motion.span>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 leading-tight tracking-tight"
            >
              Delicious meals, <br />
              <span className="text-emerald-600 dark:text-emerald-500">tailored to your lifestyle.</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed"
            >
              Get personalized meal plans, grocery lists, and recipes that fit your dietary needs and taste preferences. Eating healthy has never been this easy.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link
                href={ctaHref}
                className="w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-full font-semibold hover:bg-emerald-700 transition-colors shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                Get Started Free <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href={ctaHref}
                className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                View Plans
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      {/* <section className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">Why Choose NutriPlan?</h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">We combine nutritional science with culinary expertise to bring you the best meal planning experience.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                icon: <Clock className="w-8 h-8 text-emerald-600" />,
                title: "Save Time",
                description: "Skip the planning and grocery list making. We do it all for you in seconds."
              },
              {
                icon: <Leaf className="w-8 h-8 text-emerald-600" />,
                title: "Eat Healthy",
                description: "Balanced nutrition designed by experts to meet your specific health goals."
              },
              {
                icon: <Heart className="w-8 h-8 text-emerald-600" />,
                title: "Love Your Food",
                description: "Discover new recipes that match your taste preferences and dietary restrictions."
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -5 }}
                className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-xl shadow-sm flex items-center justify-center mb-6 border border-emerald-100 dark:border-emerald-900/30">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section> */}

      {/* Image Showcase Section */}
      {/* <section className="py-24 bg-slate-900 text-white overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-24">
            <div className="w-full md:w-1/2 relative">
              <div className="relative z-10 grid grid-cols-2 gap-4">
                <img
                  src="https://images.unsplash.com/photo-1681270543584-8e541a1bb056?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGVmJTIwY29va2luZ3xlbnwxfHx8fDE3NzE0NzAxMTR8MA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Chef cooking"
                  className="rounded-2xl shadow-2xl object-cover h-64 w-full translate-y-8"
                />
                <img
                  src="https://images.unsplash.com/photo-1579113800032-c38bd7635818?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMHZlZ2V0YWJsZXN8ZW58MXx8fHwxNzcxMzU4OTMwfDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Fresh vegetables"
                  className="rounded-2xl shadow-2xl object-cover h-64 w-full"
                />
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-emerald-500/20 blur-3xl rounded-full -z-0 pointer-events-none" />
            </div>

            <div className="w-full md:w-1/2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-4">
                <ChefHat className="w-5 h-5" />
                <span>Expertly Curated</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">
                From our kitchen <br />
                to your table.
              </h2>
              <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                We partner with professional chefs and nutritionists to ensure every meal is not only healthy but absolutely delicious. Say goodbye to boring diet food.
              </p>

              <ul className="space-y-4">
                {[
                  "Over 5,000+ unique recipes",
                  "Video tutorials for every meal",
                  "Smart grocery lists that sync to your phone"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-200">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section> */}

      {/* Testimonials */}
      {/* <section className="py-24 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">What our users say</h2>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-900/30">
              <div className="flex items-center gap-1 mb-4 text-amber-400">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
              </div>
              <p className="text-slate-600 dark:text-slate-300 mb-6 text-lg italic">"I've tried every meal planner out there. This is the only one that actually listens to what I like. The recipes are incredible!"</p>
              <div className="flex items-center gap-4">
                <img
                  src="https://images.unsplash.com/photo-1653771925530-a699fbfa26fb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMHBlcnNvbiUyMGVhdGluZ3xlbnwxfHx8fDE3NzE0NzAxMTR8MA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Sarah"
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Sarah Jenkins</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Lost 15 lbs in 3 months</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-900/30">
              <div className="flex items-center gap-1 mb-4 text-amber-400">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
              </div>
              <p className="text-slate-600 dark:text-slate-300 mb-6 text-lg italic">"The grocery list feature saves me at least an hour every week. Plus, I'm wasting way less food. Highly recommend!"</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">MJ</div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Mike Johnson</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Busy professional</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section> */}

      {/* CTA */}
      {/* <section className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto bg-emerald-600 rounded-3xl p-12 relative overflow-hidden text-white shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to eat better?</h2>
              <p className="text-emerald-100 text-lg mb-8 max-w-xl mx-auto">Join thousands of happy users who have transformed their relationship with food.</p>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-emerald-700 rounded-full font-bold hover:bg-emerald-50 transition-colors shadow-lg"
              >
                Create Your Free Plan
              </Link>
            </div>
          </div>
        </div>
      </section> */}
    </div>
  );
}
