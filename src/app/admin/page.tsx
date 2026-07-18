import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Settings, Users, ListOrdered } from 'lucide-react'

const SECTIONS = [
  {
    href: '/admin/settings',
    icon: Settings,
    title: 'Site Settings',
    description: 'Global defaults like the pool-creation limit',
  },
  {
    href: '/admin/users',
    icon: Users,
    title: 'Users',
    description: 'Browse users and set per-user pool limits',
  },
  {
    href: '/admin/nflplayerrankings',
    icon: ListOrdered,
    title: 'NFL Player Rankings',
    description: 'Fantasy football draft rankings',
  },
]

export default function AdminIndexPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Site Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
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
  )
}
