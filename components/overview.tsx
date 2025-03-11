import { motion } from 'framer-motion';
import Link from 'next/link';

import { MessageIcon } from './icons';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <p className="flex flex-row justify-center gap-4 items-center">
          <MessageIcon size={32} />
        </p>
        <p>
          Welcome to your AI chatbot! This is a modern, customizable chat interface
          built with Next.js. It features real-time streaming responses, markdown support,
          and a clean, responsive design.
        </p>
        <p>
          Start a conversation by typing a message below. You can create multiple chat
          sessions and switch between different AI models.
        </p>
      </div>
    </motion.div>
  );
};
