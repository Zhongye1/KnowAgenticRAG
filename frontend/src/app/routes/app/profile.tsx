import { ContentLayout } from '@/components/layouts';
import { UpdateProfile } from '@/features/users/components/update-profile';
import { useUser } from '@/lib/auth';

type EntryProps = {
  label: string;
  value: string;
};
const Entry = ({ label, value }: EntryProps) => (
  <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
    <dt className="text-sm font-medium text-color-text-3">{label}</dt>
    <dd className="mt-1 text-sm text-color-text-1 sm:col-span-2 sm:mt-0">
      {value}
    </dd>
  </div>
);

const ProfileRoute = () => {
  const user = useUser();

  if (!user.data) return null;

  return (
    <ContentLayout title="Profile">
      <div className="overflow-hidden bg-color-bg-2 shadow-2-center sm:rounded-large">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex justify-between">
            <h3 className="text-lg font-medium leading-6 text-color-text-1">
              User Information
            </h3>
            <UpdateProfile />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-color-text-3">
            Personal details of the user.
          </p>
        </div>
        <div className="border-t border-color-border-2 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-color-border-2">
            <Entry label="First Name" value={user.data.firstName} />
            <Entry label="Last Name" value={user.data.lastName} />
            <Entry label="Email Address" value={user.data.email} />
            <Entry label="Role" value={user.data.role} />
            <Entry label="Bio" value={user.data.bio} />
          </dl>
        </div>
      </div>
    </ContentLayout>
  );
};

export default ProfileRoute;
