using System;
using System.Diagnostics;

namespace FastGitPush
{
    class Program
    {
        static void Main(string[] args)
        {
            try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { }

            Console.Title = "🚀 Emperor Burger — Fast Git Push";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("=================================================");
            Console.WriteLine("       🍔 EMPEROR BURGER FAST GIT PUSH 🚀       ");
            Console.WriteLine("=================================================");
            Console.ResetColor();
            Console.WriteLine();

            // Commit message
            string commitMsg = "";
            if (args.Length > 0)
            {
                commitMsg = string.Join(" ", args);
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.Write("Enter commit message (Press ENTER for auto-timestamp): ");
                Console.ResetColor();
                try
                {
                    commitMsg = Console.ReadLine();
                }
                catch { }
            }

            if (string.IsNullOrWhiteSpace(commitMsg))
            {
                commitMsg = "Update Emperor Burger: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine(">> Commit Message: \"" + commitMsg + "\"");
            Console.ResetColor();
            Console.WriteLine();

            // 1. git add -A
            RunStep("1/4 Staging all files (git add)...", "git", "add -A");

            // 2. git commit
            RunStep("2/4 Creating commit...", "git", "commit -m \"" + commitMsg.Replace("\"", "\\\"") + "\"");

            // 3. git push origin main
            RunStep("3/4 Pushing to origin/main (Triggers Vercel Deploy)...", "git", "push origin main");

            // 4. Sync master
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("4/4 Syncing master branch...");
            Console.ResetColor();
            ExecuteCommand("git", "checkout master");
            ExecuteCommand("git", "merge main");
            ExecuteCommand("git", "push origin master");
            ExecuteCommand("git", "checkout main");

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("=================================================");
            Console.WriteLine("  🎉 SUCCESS! ALL CHANGES PUSHED & DEPLOYED!     ");
            Console.WriteLine("=================================================");
            Console.ResetColor();
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Gray;
            Console.WriteLine("Press any key to close this window...");
            Console.ResetColor();
            try
            {
                if (Environment.UserInteractive && !Console.IsInputRedirected)
                {
                    Console.ReadKey();
                }
            }
            catch { }
        }

        static void RunStep(string label, string cmd, string args)
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.Write(label + " ");
            Console.ResetColor();

            int code = ExecuteCommand(cmd, args);
            if (code == 0)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("✓");
                Console.ResetColor();
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[done]");
                Console.ResetColor();
            }
        }

        static int ExecuteCommand(string fileName, string arguments)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: " + ex.Message);
                Console.ResetColor();
                return -1;
            }
        }
    }
}
