import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Settings, Users, ListOrdered, Database, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Section {
  href: string
  icon: LucideIcon
  title: string
  description: string
}

const GROUPS: Array<{ heading: string; sections: Section[] }> = [
  {
    heading: 'Site',
    sections: [
      {
        href: '/admin/settings',
        icon: Settings,
        title: 'Site Settings',
        description: 'Global defaults like the pool-creation limit',
      },
    ],
  },
  {
    heading: 'Users',
    sections: [
      {
        href: '/admin/users',
        icon: Users,
        title: 'Users',
        description: 'Browse users, grant admin, set per-user pool limits',
      },
    ],
  },
  {
    heading: 'NFL Data',
    sections: [
      {
        href: '/admin/nfl',
        icon: Database,
        title: 'Data Hub',
        description: 'Freshness status and manual refresh triggers',
      },
      {
        href: '/admin/nflplayerrankings',
        icon: ListOrdered,
        title: 'Player Rankings',
        description: 'Fantasy football draft rankings and overrides',
      },
    ],
  },
  {
    heading: 'Pools',
    sections: [
      {
        href: '/admin/pools',
        icon: Trophy,
        title: 'All Pools',
        description: 'Every pool on the site, plus best ball test mode',
      },
    ],
  },
]

export default function AdminIndexPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Site Admin</h1>
      {GROUPS.map(({ heading, sections }) => (
        <div key={heading}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map(({ href, icon: Icon, title, description }) => (
              <Link key={href} href={href}>
                <Card className="h-full py-0 transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 px-4 py-4">
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
