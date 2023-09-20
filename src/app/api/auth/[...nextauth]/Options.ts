import connectDB from "@/configs/dbConfig/dbConfig";
import clientPromise from "@/configs/mongodbClient";
import Users from "@/models/user";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import Credentials, {
  CredentialsProvider,
} from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { isDotDotDotToken } from "typescript";
import { EMAIL_TYPE } from "@/constants/email";
import { sendMail } from "@/helpers/mailer";
import { createStripeCustomer } from "@/configs/stripe";

export const options: NextAuthOptions = {
  // adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", placeholder: "jsmith" },
        password: { label: "Password", placeholder: "password" },
      },

      async authorize(credentials) {
        if (!credentials || !credentials.email || !credentials.password) {
          return null;
        }
        await connectDB();

        const foundUser = await Users.findOne({ email: credentials.email });

        if (!foundUser) {
          return null;
        }
        const isMatch = await bcrypt.compare(
          credentials.password,
          foundUser.password
        );

        if (!isMatch) {
          return null;
        } else {
          return foundUser;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }: any) {
      // console.log("token", token);
      // console.log("user", user);

      if (user) {
        token.role = user.role;
        token.stripeCustomerId = user.stripeCustomerId;
        token.isActiveSubscription = user.isActiveSubscription;
        token.subscriptionId = user.subscriptionId;
      }
      return token;
    },

    async signIn({ account, profile }: any) {
      if (account!.provider === "google") {
        try {
          await connectDB();
          const email = profile!.email;
          const email_verified = profile!.email_verified;

          const userFound = await Users.findOne({ email });

          if (!userFound) {
            const customer = await createStripeCustomer(email);

            const usercreated = await Users.create({
              email: email,
              provider: "google",
              stripeCustomerId: customer.id,
              role: "user",
              isActiveSubscription: false,
              isVarified: false,
            });
            if (!usercreated) {
              return false;
            }

            // console.log("usercreated", usercreated);
            // console.log("stripeCustomer", customer);

            // await sendMail(email, usercreated._id, EMAIL_TYPE.VERIFY);

            return account;
          } else {
            // account.user!.stripeCustomerId = userFound.stripeCustomerId;
            // account.user!.isActiveSubscription = userFound.isActiveSubscription;
            // account.user!.subscriptionId = userFound.subscriptionId;
            return account;
          }

          return userFound;
        } catch (error) {
          // console.log(error);

          return false;
        }
      }

      return account;
    },

    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role as string;
      }
      // console.log("session", session);

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    newUser: "/signup",
    verifyRequest: "/verifymail",
  },
};
